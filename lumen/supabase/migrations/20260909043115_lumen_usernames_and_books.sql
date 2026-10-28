-- Apply after the original profiles migration, inside one migration transaction.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter table public.profiles add column if not exists username text;
-- Existing accounts receive an unambiguous handle; they may change it in Account.
update public.profiles
set username = 'user_' || left(replace(id::text, '-', ''), 19)
where username is null;
alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,24}$');
alter table public.profiles add constraint profiles_username_unique unique (username);

-- Only public handles are exposed for availability lookups, never emails or IDs.
create table public.usernames (
  username text primary key check (username ~ '^[a-z0-9_]{3,24}$')
);
insert into public.usernames (username) select username from public.profiles;
alter table public.usernames enable row level security;
revoke all on public.usernames from public, anon, authenticated;
grant select on public.usernames to anon, authenticated;
create policy usernames_read on public.usernames for select to anon, authenticated using (true);

create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(lower(btrim(p_username)) ~ '^[a-z0-9_]{3,24}$'
    and not exists (select 1 from public.usernames where username = lower(btrim(p_username))), false);
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function private.normalize_profile_username()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.username := lower(btrim(new.username));
  return new;
end;
$$;
revoke all on function private.normalize_profile_username() from public, anon, authenticated;
create trigger normalize_profile_username before insert or update of username on public.profiles
for each row execute function private.normalize_profile_username();

-- Trigger-only privilege: reservations and releases commit with the profile write.
create or replace function private.sync_username_registry()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.username = old.username then return new; end if;
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.usernames where username = old.username;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.usernames (username) values (new.username);
    return new;
  end if;
  return old;
end;
$$;
revoke all on function private.sync_username_registry() from public, anon, authenticated;
create trigger sync_username_registry after insert or update of username or delete on public.profiles
for each row execute function private.sync_username_registry();

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare chosen_username text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if chosen_username is null or chosen_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'A valid username is required' using errcode = '23514';
  end if;
  insert into public.profiles (id, email, full_name, username)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100), chosen_username);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.update_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
revoke all on function public.update_updated_at() from public, anon, authenticated;

-- Server enforcement: an AAL1 token cannot bypass an enrolled second factor.
create or replace function private.has_required_aal()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$$;
revoke all on function private.has_required_aal() from public, anon, authenticated;
grant execute on function private.has_required_aal() to authenticated;
create or replace function public.has_required_aal()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.has_required_aal(); $$;
revoke all on function public.has_required_aal() from public, anon, authenticated;
grant execute on function public.has_required_aal() to authenticated;

drop policy if exists select_own_profile on public.profiles;
drop policy if exists insert_own_profile on public.profiles;
drop policy if exists update_own_profile on public.profiles;
drop policy if exists delete_own_profile on public.profiles;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, username) on public.profiles to authenticated;
create policy select_own_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select public.has_required_aal()));
create policy update_own_profile on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.has_required_aal()))
  with check (id = (select auth.uid()) and (select public.has_required_aal()));

-- Requires auth migration including public.has_required_aal().
-- Metadata is public; reading files requires a signed-in, fully verified session.
create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null check (char_length(btrim(author)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (category in ('Derecho', 'Ciencias Sociales', 'Ciencias Exactas', 'Literatura', 'Salud', 'Tecnología', 'Arte y Cultura', 'Otros')),
  file_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 240),
  mime_type text not null check (mime_type in ('application/pdf', 'application/epub+zip')),
  size_bytes bigint not null check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('spanish', title), 'A') ||
    setweight(to_tsvector('spanish', author), 'B') ||
    setweight(to_tsvector('spanish', category || ' ' || description), 'C')
  ) stored,
  constraint books_identity_path check (
    file_path = owner_id::text || '/' || id::text ||
      case mime_type when 'application/pdf' then '.pdf' else '.epub' end
  )
);

create index books_search_idx on public.books using gin(search_document);
create index books_category_created_idx on public.books(category, created_at desc, id desc);
create index books_created_idx on public.books(created_at desc, id desc);
create index books_owner_idx on public.books(owner_id);

alter table public.books enable row level security;
revoke all on public.books from anon, authenticated;
grant select on public.books to anon, authenticated;
grant insert (id, owner_id, title, author, description, category, file_path, file_name, mime_type, size_bytes) on public.books to authenticated;
grant delete on public.books to authenticated;

create policy "books_public_catalog" on public.books for select to anon, authenticated using (true);
create policy "books_publish_own_uploaded_object" on public.books for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (select public.has_required_aal())
  and exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'lumen-books'
      and object.name = books.file_path
      and object.owner_id = (select auth.uid())::text
      and (object.metadata->>'size')::bigint = books.size_bytes
      and object.metadata->>'mimetype' = books.mime_type
  )
);
create policy "books_delete_own" on public.books for delete to authenticated
using (owner_id = (select auth.uid()) and (select public.has_required_aal()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lumen-books', 'lumen-books', false, 20971520, array['application/pdf', 'application/epub+zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- New paths are immutable. Upserts/replacements have no UPDATE policy.
create policy "lumen_books_upload_own" on storage.objects for insert to authenticated
with check (
  bucket_id = 'lumen-books'
  and (select public.has_required_aal())
  and owner_id = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|epub)$')
);

-- Owners can see their temporary upload for publication/rollback; readers can
-- access only objects with a catalogue record. Bucket remains private.
create policy "lumen_books_read_published" on storage.objects for select to authenticated
using (
  bucket_id = 'lumen-books'
  and (select public.has_required_aal())
  and (
    owner_id = (select auth.uid())::text
    or exists (select 1 from public.books as book where book.file_path = storage.objects.name)
  )
);
create policy "lumen_books_remove_own" on storage.objects for delete to authenticated
using (
  bucket_id = 'lumen-books'
  and (select public.has_required_aal())
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- File bytes must be removed via the Storage API, never DELETE storage.objects.
-- Upload MIME/size constraints are not malware scanning or licensing verification.
