import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// These tests execute the application's actual SQL on embedded PostgreSQL.
// The Auth/Storage tables below are minimal test stand-ins, not a Supabase server.
// They cannot validate GoTrue, email delivery, HTTP/JWT verification, Storage file
// bytes or its upload transaction, signed URLs, API exposure, or concurrency.
const root = new URL('../', import.meta.url);
const ids = {
  alice: '10000000-0000-4000-8000-000000000001',
  bob: '10000000-0000-4000-8000-000000000002',
  invalid: '10000000-0000-4000-8000-000000000003',
  duplicate: '10000000-0000-4000-8000-000000000004',
  missing: '10000000-0000-4000-8000-000000000005',
};

const fixture = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE SCHEMA storage;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE auth.mfa_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status text NOT NULL,
    factor_type text NOT NULL DEFAULT 'totp',
    friendly_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(auth.jwt()->>'sub', '')::uuid
  $$;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL,
    owner uuid,
    owner_id text,
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE storage.objects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id text REFERENCES storage.buckets(id),
    name text NOT NULL,
    owner uuid,
    owner_id text,
    metadata jsonb,
    user_metadata jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_accessed_at timestamptz DEFAULT now(),
    UNIQUE(bucket_id, name)
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
    SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]
  $$;
  CREATE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT reverse(split_part(reverse(name), '.', 1))
  $$;
`;

async function loadApplicationSql(db) {
  const migrations = (await readdir(new URL('supabase/migrations/', root)))
    .filter((name) => name.endsWith('.sql')).sort();
  for (const name of migrations) {
    await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8'));
  }
}

async function asRole(db, userId, fn, aal = 'aal1') {
  return db.transaction(async (tx) => {
    const role = userId ? 'authenticated' : 'anon';
    await tx.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims', JSON.stringify({ role, aal, ...(userId ? { sub: userId } : {}) }),
    ]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

async function signUp(db, id, username) {
  const metadata = username === undefined ? {} : { username, full_name: 'Private full name' };
  return db.query('INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)',
    [id, `${id}@example.invalid`, JSON.stringify(metadata)]);
}

async function denied(operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, '42501', `Expected a permission/RLS denial; got ${error.code}: ${error.message}`);
    return true;
  });
}

function book(number, overrides = {}) {
  const id = `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  return {
    id, owner_id: ids.alice, title: 'Lecturas de prueba', author: 'Autora de prueba',
    description: 'Documento sintético sin contenido de terceros.', category: 'Literatura',
    file_path: `${ids.alice}/${id}.pdf`, file_name: 'prueba.pdf', mime_type: 'application/pdf',
    size_bytes: 1024, ...overrides,
  };
}

async function uploadObject(db, entry, userId = ids.alice, overrides = {}, aal = 'aal1') {
  const object = {
    name: entry.file_path, owner_id: entry.owner_id,
    metadata: { size: entry.size_bytes, mimetype: entry.mime_type }, ...overrides,
  };
  return asRole(db, userId, (tx) => tx.query(
    "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('lumen-books', $1, $2, $3::jsonb) RETURNING name",
    [object.name, object.owner_id, JSON.stringify(object.metadata)],
  ), aal);
}

async function publishBook(db, entry, userId = ids.alice, aal = 'aal1') {
  // Column names are static application metadata, never untrusted user strings.
  const columns = ['id', 'owner_id', 'title', 'author', 'description', 'category', 'file_path', 'file_name', 'mime_type', 'size_bytes'];
  return asRole(db, userId, (tx) => tx.query(
    `INSERT INTO public.books(${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
    columns.map((column) => entry[column]),
  ), aal);
}

test('database integration: migrations, usernames, access policies and book storage', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixture);
  await loadApplicationSql(db);
  await signUp(db, ids.alice, '  Alice_Reader  ');
  await signUp(db, ids.bob, 'Bob_Reader');

  await t.test('signup normalizes usernames and creates one private profile', async () => {
    const { rows } = await db.query('SELECT id, username FROM public.profiles ORDER BY id');
    assert.deepEqual(rows, [{ id: ids.alice, username: 'alice_reader' }, { id: ids.bob, username: 'bob_reader' }]);
  });

  await t.test('duplicate username differing by case/spaces rejects and rolls back the auth user', async () => {
    await assert.rejects(() => signUp(db, ids.duplicate, ' ALICE_READER '));
    const result = await db.query('SELECT count(*)::int AS count FROM auth.users WHERE id = $1', [ids.duplicate]);
    assert.equal(result.rows[0].count, 0);
  });

  await t.test('blank, null and absent usernames reject signup without orphan auth/profile rows', async () => {
    for (const value of ['', '   ', '\t\n', null]) {
      await assert.rejects(() => signUp(db, ids.invalid, value), `Accepted invalid username ${JSON.stringify(value)}`);
    }
    await assert.rejects(() => signUp(db, ids.missing, undefined));
    const { rows } = await db.query('SELECT count(*)::int AS count FROM auth.users WHERE id = ANY($1::uuid[])', [[ids.invalid, ids.missing]]);
    assert.equal(rows[0].count, 0);
  });

  await t.test('freeform usernames are accepted and case-insensitive duplicates still reject', async () => {
    const names = ['c-uervo', '  Águila  ', '📚', 'Lector de Lumen', 'q', 'x'.repeat(60)];
    for (const [index, name] of names.entries()) {
      const id = `10000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
      await signUp(db, id, name);
      const { rows } = await db.query('SELECT username FROM public.profiles WHERE id = $1', [id]);
      assert.deepEqual(rows, [{ username: name.trim().toLowerCase() }]);
      const reserved = await asRole(db, null, (tx) => tx.query(
        'SELECT public.is_username_available($1) AS available', [name],
      ));
      assert.deepEqual(reserved.rows, [{ available: false }]);
    }
    await assert.rejects(() => signUp(db, ids.duplicate, ' C-UERVO '), { code: '23505' });
    await assert.rejects(() => asRole(db, ids.bob, (tx) => tx.query(
      'UPDATE public.profiles SET username=$1 WHERE id=$2', [' C-UERVO ', ids.bob],
    )), { code: '23505' });
    const duplicate = await db.query('SELECT count(*)::int AS count FROM auth.users WHERE id = $1', [ids.duplicate]);
    assert.equal(duplicate.rows[0].count, 0);
    const unchanged = await db.query('SELECT username FROM public.profiles WHERE id = $1', [ids.bob]);
    assert.deepEqual(unchanged.rows, [{ username: 'bob_reader' }]);
  });

  await t.test('availability is boolean, normalized and accessible without exposing profile data', async () => {
    await asRole(db, null, async (tx) => {
      for (const [candidate, expected] of [
        ['ALICE_READER', false], [' C-UERVO ', false], ['brand_new_reader', true],
        ['bad-name', true], ['otro lector 📖', true], ['z', true], ['y'.repeat(60), true],
        ['', false], [' \t\n', false], [null, false],
      ]) {
        const { rows } = await tx.query('SELECT public.is_username_available($1) AS available', [candidate]);
        assert.deepEqual(rows, [{ available: expected }]);
      }
      const { rows } = await tx.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='usernames'");
      assert.deepEqual(rows.map((row) => row.column_name), ['username']);
    });
    await denied(() => asRole(db, null, (tx) => tx.query('SELECT * FROM public.profiles')));
    const { rows } = await asRole(db, ids.alice, (tx) => tx.query('SELECT id, email FROM public.profiles'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, ids.alice);
  });

  await t.test('own profile update succeeds; another user and restricted columns cannot be changed', async () => {
    const update = await asRole(db, ids.alice, (tx) => tx.query("UPDATE public.profiles SET full_name='Alice' WHERE id=$1 RETURNING full_name", [ids.alice]));
    assert.deepEqual(update.rows, [{ full_name: 'Alice' }]);
    const other = await asRole(db, ids.alice, (tx) => tx.query("UPDATE public.profiles SET full_name='Intruder' WHERE id=$1 RETURNING id", [ids.bob]));
    assert.equal(other.rows.length, 0);
    await denied(() => asRole(db, ids.alice, (tx) => tx.query("UPDATE public.profiles SET email='changed@example.invalid' WHERE id=$1", [ids.alice])));
    await denied(() => asRole(db, ids.alice, (tx) => tx.query('DELETE FROM public.profiles WHERE id=$1', [ids.alice])));
  });

  await t.test('username updates reserve the new name and release the old one atomically', async () => {
    await asRole(db, ids.bob, (tx) => tx.query("UPDATE public.profiles SET username=' NEW_BOB ' WHERE id=$1", [ids.bob]));
    const before = await asRole(db, null, (tx) => tx.query("SELECT public.is_username_available('bob_reader') AS old_free, public.is_username_available('new_bob') AS new_free"));
    assert.deepEqual(before.rows, [{ old_free: true, new_free: false }]);
    await assert.rejects(() => asRole(db, ids.bob, (tx) => tx.query("UPDATE public.profiles SET username='ALICE_READER' WHERE id=$1", [ids.bob])));
    const after = await asRole(db, null, (tx) => tx.query("SELECT public.is_username_available('alice_reader') AS alice_free, public.is_username_available('new_bob') AS bob_free"));
    assert.deepEqual(after.rows, [{ alice_free: false, bob_free: false }]);
  });

  await t.test('verified MFA requires AAL2 before protected profile writes', async () => {
    await db.query("INSERT INTO auth.mfa_factors(user_id, status) VALUES ($1, 'verified')", [ids.bob]);
    const noFactor = await asRole(db, ids.alice, (tx) => tx.query('SELECT public.has_required_aal() AS allowed'));
    assert.equal(noFactor.rows[0].allowed, true);
    const low = await asRole(db, ids.bob, (tx) => tx.query('SELECT public.has_required_aal() AS allowed'));
    assert.equal(low.rows[0].allowed, false);
    const high = await asRole(db, ids.bob, (tx) => tx.query('SELECT public.has_required_aal() AS allowed'), 'aal2');
    assert.equal(high.rows[0].allowed, true);
    const blocked = await asRole(db, ids.bob, (tx) => tx.query("UPDATE public.profiles SET full_name='Bypass MFA' WHERE id=$1 RETURNING id", [ids.bob]));
    assert.equal(blocked.rows.length, 0);
    const allowed = await asRole(db, ids.bob, (tx) => tx.query("UPDATE public.profiles SET full_name='Verified Bob' WHERE id=$1 RETURNING id", [ids.bob]), 'aal2');
    assert.deepEqual(allowed.rows, [{ id: ids.bob }]);
    await db.query('DELETE FROM auth.mfa_factors WHERE user_id=$1', [ids.bob]);
  });

  await t.test('private book bucket config restricts MIME and size for the actual Storage service', async () => {
    const { rows } = await db.query("SELECT public, file_size_limit::int, allowed_mime_types FROM storage.buckets WHERE id='lumen-books'");
    assert.deepEqual(rows, [{ public: false, file_size_limit: 20971520, allowed_mime_types: ['application/pdf', 'application/epub+zip'] }]);
  });

  await t.test('valid owner upload is private until published; publication enables authenticated file reads', async () => {
    const entry = book(1);
    await uploadObject(db, entry);
    const unpublished = await asRole(db, ids.bob, (tx) => tx.query('SELECT name FROM storage.objects WHERE name=$1', [entry.file_path]));
    assert.deepEqual(unpublished.rows, []);
    const owner = await asRole(db, ids.alice, (tx) => tx.query('SELECT name FROM storage.objects WHERE name=$1', [entry.file_path]));
    assert.deepEqual(owner.rows, [{ name: entry.file_path }]);
    assert.deepEqual((await publishBook(db, entry)).rows, [{ id: entry.id }]);
    const catalog = await asRole(db, null, (tx) => tx.query('SELECT id, title FROM public.books'));
    assert.deepEqual(catalog.rows, [{ id: entry.id, title: entry.title }]);
    const reader = await asRole(db, ids.bob, (tx) => tx.query('SELECT name FROM storage.objects WHERE name=$1', [entry.file_path]));
    assert.deepEqual(reader.rows, [{ name: entry.file_path }]);
    const anonymous = await asRole(db, null, (tx) => tx.query('SELECT name FROM storage.objects'));
    assert.deepEqual(anonymous.rows, []);
  });

  await t.test('anonymous uploads and publication are denied, and other owners cannot claim a file', async () => {
    const entry = book(2);
    await denied(() => uploadObject(db, entry, null));
    await denied(() => publishBook(db, entry, null));
    await denied(() => uploadObject(db, entry, ids.bob));
    await uploadObject(db, entry);
    await denied(() => publishBook(db, entry, ids.bob));
  });

  await t.test('storage rejects another owner path, malformed paths and unsupported extensions', async () => {
    const entry = book(3);
    for (const name of [`${ids.bob}/${entry.id}.pdf`, `${ids.alice}/arbitrary.pdf`, `${ids.alice}/${entry.id}.exe`, `${ids.alice}/nested/${entry.id}.pdf`]) {
      await denied(() => uploadObject(db, entry, ids.alice, { name }));
    }
    await denied(() => uploadObject(db, entry, ids.alice, { owner_id: ids.bob }));
  });

  await t.test('publication requires existing object with exact owner, size, MIME and book identity', async () => {
    await denied(() => publishBook(db, book(4)));
    const entry = book(5);
    await uploadObject(db, entry);
    await denied(() => publishBook(db, { ...entry, size_bytes: 1025 }));
    await denied(() => publishBook(db, { ...entry, mime_type: 'application/epub+zip' }));
    await denied(() => publishBook(db, { ...entry, file_path: book(1).file_path, owner_id: ids.bob }));
    await assert.rejects(() => publishBook(db, { ...entry, id: book(6).id }), { code: '23514' });
  });

  await t.test('book metadata constraints reject bad titles, categories and oversize records', async () => {
    const entry = book(7);
    await uploadObject(db, entry);
    for (const changes of [{ title: ' ' }, { title: 'x'.repeat(201) }, { author: '' }, { category: 'Unknown' }, { description: 'x'.repeat(2001) }]) {
      await assert.rejects(() => publishBook(db, { ...entry, ...changes }), { code: '23514' });
    }
    // The Storage HTTP service enforces bucket size; this artificial object tests
    // an independent SQL constraint on catalogue metadata even if it is bypassed.
    const oversized = book(8, { size_bytes: 20971521 });
    await uploadObject(db, oversized);
    await assert.rejects(() => publishBook(db, oversized), { code: '23514' });
  });

  await t.test('EPUB objects and metadata publish successfully with matching extension and MIME', async () => {
    const entry = book(9);
    entry.file_path = entry.file_path.replace('.pdf', '.epub');
    entry.file_name = 'prueba.epub';
    entry.mime_type = 'application/epub+zip';
    await uploadObject(db, entry);
    assert.deepEqual((await publishBook(db, entry)).rows, [{ id: entry.id }]);
  });

  await t.test('another user cannot edit or delete books or their objects; owner can remove both', async () => {
    const entry = book(9);
    entry.file_path = entry.file_path.replace('.pdf', '.epub');
    await denied(() => asRole(db, ids.bob, (tx) => tx.query("UPDATE public.books SET title='Intruder' WHERE id=$1", [entry.id])));
    const otherBook = await asRole(db, ids.bob, (tx) => tx.query('DELETE FROM public.books WHERE id=$1 RETURNING id', [entry.id]));
    assert.deepEqual(otherBook.rows, []);
    const otherObject = await asRole(db, ids.bob, (tx) => tx.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [entry.file_path]));
    assert.deepEqual(otherObject.rows, []);
    const replacement = await asRole(db, ids.alice, (tx) => tx.query("UPDATE storage.objects SET metadata='{}'::jsonb WHERE name=$1 RETURNING name", [entry.file_path]));
    assert.deepEqual(replacement.rows, []);
    const ownBook = await asRole(db, ids.alice, (tx) => tx.query('DELETE FROM public.books WHERE id=$1 RETURNING id', [entry.id]));
    assert.deepEqual(ownBook.rows, [{ id: entry.id }]);
    const ownObject = await asRole(db, ids.alice, (tx) => tx.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [entry.file_path]));
    assert.deepEqual(ownObject.rows, [{ name: entry.file_path }]);
  });

  await t.test('MFA blocks AAL1 book upload, publication, deletion and file reads, AAL2 restores access', async () => {
    const entry = book(10);
    await uploadObject(db, entry);
    await db.query("INSERT INTO auth.mfa_factors(user_id, status) VALUES ($1, 'verified')", [ids.alice]);
    await denied(() => uploadObject(db, book(11)));
    await denied(() => publishBook(db, entry));
    const blockedRead = await asRole(db, ids.alice, (tx) => tx.query('SELECT name FROM storage.objects'));
    assert.deepEqual(blockedRead.rows, []);
    const blockedDelete = await asRole(db, ids.alice, (tx) => tx.query('DELETE FROM public.books WHERE id=$1 RETURNING id', [book(1).id]));
    assert.deepEqual(blockedDelete.rows, []);
    await uploadObject(db, book(11), ids.alice, {}, 'aal2');
    assert.deepEqual((await publishBook(db, entry, ids.alice, 'aal2')).rows, [{ id: entry.id }]);
    const restored = await asRole(db, ids.alice, (tx) => tx.query('SELECT name FROM storage.objects WHERE name=$1', [entry.file_path]), 'aal2');
    assert.deepEqual(restored.rows, [{ name: entry.file_path }]);
    await db.query('DELETE FROM auth.mfa_factors WHERE user_id=$1', [ids.alice]);
  });
});
