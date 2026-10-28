/*
  Versioned legal library and expediente analysis for Juris.

  Legal texts are shared read-only reference material. Extracted expediente
  content, process analyses, and drafts remain isolated by despacho RLS.
*/

create extension if not exists vector with schema extensions;

create table if not exists public.legal_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_name text not null,
  jurisdiction text not null check (jurisdiction in ('federal', 'nacional', 'coahuila')),
  authority text not null,
  materias text[] not null default '{}',
  source_page_url text,
  official_document_url text not null,
  status text not null default 'vigente' check (status in ('vigente', 'transitorio', 'abrogado', 'por_verificar')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.legal_sources(id) on delete cascade,
  version_label text not null,
  publication_date date,
  last_reform_date date,
  effective_from date,
  effective_to date,
  official_document_url text not null,
  sha256 text not null,
  file_size bigint,
  page_count integer,
  is_current boolean not null default true,
  ingestion_status text not null default 'pending'
    check (ingestion_status in ('pending', 'processing', 'ready', 'failed')),
  ingestion_error text,
  ingested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, sha256)
);

create unique index if not exists idx_legal_source_one_current_version
  on public.legal_source_versions(source_id)
  where is_current;

create table if not exists public.legal_chunks (
  id bigint generated always as identity primary key,
  source_id uuid not null references public.legal_sources(id) on delete cascade,
  version_id uuid not null references public.legal_source_versions(id) on delete cascade,
  chunk_index integer not null,
  article_reference text,
  heading text,
  content text not null,
  page_start integer,
  page_end integer,
  citation_label text not null,
  embedding_model text,
  embedding extensions.vector,
  search_vector tsvector generated always as (
    to_tsvector(
      'spanish',
      coalesce(article_reference, '') || ' ' ||
      coalesce(heading, '') || ' ' ||
      content
    )
  ) stored,
  created_at timestamptz not null default now(),
  unique (version_id, chunk_index)
);

create index if not exists idx_legal_chunks_source_id on public.legal_chunks(source_id);
create index if not exists idx_legal_chunks_version_id on public.legal_chunks(version_id);
create index if not exists idx_legal_chunks_search_vector
  on public.legal_chunks using gin(search_vector);

create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null unique references public.document_adjuntos(id) on delete cascade,
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  expediente_id uuid references public.expedientes(id) on delete cascade,
  movimiento_id uuid references public.movimientos(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'needs_ocr', 'unsupported', 'failed')),
  extraction_method text,
  extracted_text text not null default '',
  page_count integer,
  sha256 text,
  error_message text,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_extractions_expediente
  on public.document_extractions(expediente_id);
create index if not exists idx_document_extractions_despacho
  on public.document_extractions(despacho_id);

create table if not exists public.expediente_process_analyses (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  expediente_id uuid not null references public.expedientes(id) on delete cascade,
  suggested_stage text not null,
  confidence numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  reasoning text not null,
  evidence jsonb not null default '[]'::jsonb,
  generated_by uuid references auth.users(id) on delete set null default auth.uid(),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_expediente_process_analyses_expediente
  on public.expediente_process_analyses(expediente_id, created_at desc);

create table if not exists public.juris_drafts (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  expediente_id uuid references public.expedientes(id) on delete cascade,
  document_type text not null,
  title text not null,
  instructions text not null default '',
  content text not null,
  legal_citations jsonb not null default '[]'::jsonb,
  expediente_evidence jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'final')),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_juris_drafts_expediente
  on public.juris_drafts(expediente_id, created_at desc);

drop trigger if exists set_legal_sources_updated_at on public.legal_sources;
create trigger set_legal_sources_updated_at
  before update on public.legal_sources
  for each row execute function public.set_updated_at();

drop trigger if exists set_document_extractions_updated_at on public.document_extractions;
create trigger set_document_extractions_updated_at
  before update on public.document_extractions
  for each row execute function public.set_updated_at();

drop trigger if exists set_juris_drafts_updated_at on public.juris_drafts;
create trigger set_juris_drafts_updated_at
  before update on public.juris_drafts
  for each row execute function public.set_updated_at();

create or replace function public.document_extraction_matches_attachment(
  target_attachment_id uuid,
  target_despacho_id uuid,
  target_expediente_id uuid,
  target_movimiento_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_adjuntos attachment
    where attachment.id = target_attachment_id
      and attachment.despacho_id = target_despacho_id
      and attachment.expediente_id is not distinct from target_expediente_id
      and attachment.movimiento_id is not distinct from target_movimiento_id
  );
$$;

create or replace function public.search_legal_library(
  search_text text,
  materia_filter text default null,
  jurisdiction_filter text default null,
  result_limit integer default 8
)
returns table (
  chunk_id bigint,
  source_slug text,
  source_title text,
  short_name text,
  jurisdiction text,
  article_reference text,
  heading text,
  content text,
  citation_label text,
  official_document_url text,
  version_label text,
  last_reform_date date,
  rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized_query as (
    select array_to_string(
      tsvector_to_array(to_tsvector('spanish', coalesce(trim(search_text), ''))),
      ' | '
    ) as value
  ),
  query as (
    select case
      when nullif(value, '') is null then null
      else to_tsquery('spanish', value)
    end as value
    from normalized_query
  )
  select
    chunk.id,
    source.slug,
    source.title,
    source.short_name,
    source.jurisdiction,
    chunk.article_reference,
    chunk.heading,
    chunk.content,
    chunk.citation_label,
    version.official_document_url,
    version.version_label,
    version.last_reform_date,
    case
      when query.value is null then 0::real
      else ts_rank_cd(chunk.search_vector, query.value)
    end as rank
  from public.legal_chunks chunk
  join public.legal_sources source on source.id = chunk.source_id
  join public.legal_source_versions version on version.id = chunk.version_id
  cross join query
  where version.is_current
    and version.ingestion_status = 'ready'
    and source.status in ('vigente', 'transitorio')
    and (query.value is null or chunk.search_vector @@ query.value)
    and (
      nullif(trim(materia_filter), '') is null
      or lower(trim(materia_filter)) = any (
        select lower(value) from unnest(source.materias) value
      )
    )
    and (
      nullif(trim(jurisdiction_filter), '') is null
      or source.jurisdiction = lower(trim(jurisdiction_filter))
    )
  order by rank desc, source.short_name, chunk.chunk_index
  limit greatest(1, least(coalesce(result_limit, 8), 30));
$$;

alter table public.legal_sources enable row level security;
alter table public.legal_source_versions enable row level security;
alter table public.legal_chunks enable row level security;
alter table public.document_extractions enable row level security;
alter table public.expediente_process_analyses enable row level security;
alter table public.juris_drafts enable row level security;

create policy "Authenticated users can read legal sources"
  on public.legal_sources for select to authenticated using (true);
create policy "Authenticated users can read legal source versions"
  on public.legal_source_versions for select to authenticated using (true);
create policy "Authenticated users can read legal chunks"
  on public.legal_chunks for select to authenticated using (true);

create policy "Primary owner can manage legal sources"
  on public.legal_sources for all to authenticated
  using (public.is_primary_owner()) with check (public.is_primary_owner());
create policy "Primary owner can manage legal source versions"
  on public.legal_source_versions for all to authenticated
  using (public.is_primary_owner()) with check (public.is_primary_owner());
create policy "Primary owner can manage legal chunks"
  on public.legal_chunks for all to authenticated
  using (public.is_primary_owner()) with check (public.is_primary_owner());

create policy "Despacho members can read document extractions"
  on public.document_extractions for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Despacho members can cache document extractions"
  on public.document_extractions for insert to authenticated
  with check (
    public.is_despacho_member(despacho_id)
    and processed_by = auth.uid()
    and public.document_extraction_matches_attachment(
      attachment_id,
      despacho_id,
      expediente_id,
      movimiento_id
    )
  );
create policy "Despacho members can refresh document extractions"
  on public.document_extractions for update to authenticated
  using (public.is_despacho_member(despacho_id))
  with check (
    public.is_despacho_member(despacho_id)
    and processed_by = auth.uid()
    and public.document_extraction_matches_attachment(
      attachment_id,
      despacho_id,
      expediente_id,
      movimiento_id
    )
  );

create policy "Despacho members can read process analyses"
  on public.expediente_process_analyses for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Despacho editors can create process analyses"
  on public.expediente_process_analyses for insert to authenticated
  with check (public.can_edit_despacho(despacho_id) and generated_by = auth.uid());
create policy "Despacho editors can update process analyses"
  on public.expediente_process_analyses for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));

create policy "Despacho members can read Juris drafts"
  on public.juris_drafts for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Despacho editors can create Juris drafts"
  on public.juris_drafts for insert to authenticated
  with check (public.can_edit_despacho(despacho_id) and created_by = auth.uid());
create policy "Draft authors and despacho admins can update Juris drafts"
  on public.juris_drafts for update to authenticated
  using (created_by = auth.uid() or public.can_admin_despacho(despacho_id))
  with check (created_by = auth.uid() or public.can_admin_despacho(despacho_id));

insert into public.legal_sources (
  slug,
  title,
  short_name,
  jurisdiction,
  authority,
  materias,
  source_page_url,
  official_document_url,
  status,
  notes
)
values
  (
    'cpeum',
    'Constitucion Politica de los Estados Unidos Mexicanos',
    'CPEUM',
    'federal',
    'Camara de Diputados del H. Congreso de la Union',
    array['constitucional', 'amparo', 'penal', 'civil', 'mercantil', 'laboral', 'familiar'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf',
    'vigente',
    'Texto oficial federal. La fecha de reforma se obtiene de cada version descargada.'
  ),
  (
    'codigo-comercio',
    'Codigo de Comercio',
    'CCom',
    'federal',
    'Camara de Diputados del H. Congreso de la Union',
    array['mercantil'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/CCom.pdf',
    'vigente',
    'Legislacion federal aplicable en materia mercantil.'
  ),
  (
    'cnpp',
    'Codigo Nacional de Procedimientos Penales',
    'CNPP',
    'nacional',
    'Camara de Diputados del H. Congreso de la Union',
    array['penal'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPP.pdf',
    'vigente',
    'Codigo procesal nacional; no debe confundirse con el Codigo Penal de Coahuila.'
  ),
  (
    'codigo-penal-federal',
    'Codigo Penal Federal',
    'CPF',
    'federal',
    'Camara de Diputados del H. Congreso de la Union',
    array['penal'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPF.pdf',
    'vigente',
    'Norma sustantiva federal.'
  ),
  (
    'ley-amparo',
    'Ley de Amparo, Reglamentaria de los articulos 103 y 107 de la Constitucion Politica de los Estados Unidos Mexicanos',
    'Ley de Amparo',
    'federal',
    'Camara de Diputados del H. Congreso de la Union',
    array['amparo', 'constitucional'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
    'vigente',
    'Texto oficial federal.'
  ),
  (
    'lft',
    'Ley Federal del Trabajo',
    'LFT',
    'federal',
    'Camara de Diputados del H. Congreso de la Union',
    array['laboral'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf',
    'vigente',
    'Texto oficial federal en materia laboral.'
  ),
  (
    'cnpcf',
    'Codigo Nacional de Procedimientos Civiles y Familiares',
    'CNPCF',
    'nacional',
    'Camara de Diputados del H. Congreso de la Union',
    array['civil', 'familiar'],
    'https://www.diputados.gob.mx/LeyesBiblio/index.htm',
    'https://www.diputados.gob.mx/LeyesBiblio/pdf/CNPCF.pdf',
    'transitorio',
    'Su aplicacion es gradual. Juris debe verificar la declaratoria de vigencia aplicable al organo jurisdiccional.'
  ),
  (
    'constitucion-coahuila',
    'Constitucion Politica del Estado de Coahuila de Zaragoza',
    'Constitucion Coahuila',
    'coahuila',
    'Congreso del Estado Independiente, Libre y Soberano de Coahuila de Zaragoza',
    array['constitucional', 'penal', 'civil', 'mercantil', 'laboral', 'familiar'],
    'https://www.congresocoahuila.gob.mx/portal/leyes-estatales-vigentes/',
    'https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa01.pdf',
    'vigente',
    'Texto oficial estatal.'
  ),
  (
    'codigo-civil-coahuila',
    'Codigo Civil para el Estado de Coahuila de Zaragoza',
    'Codigo Civil Coahuila',
    'coahuila',
    'Congreso del Estado Independiente, Libre y Soberano de Coahuila de Zaragoza',
    array['civil', 'familiar'],
    'https://www.congresocoahuila.gob.mx/portal/leyes-estatales-vigentes/',
    'https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa02.pdf',
    'vigente',
    'Texto oficial estatal.'
  ),
  (
    'procedimientos-familiares-coahuila',
    'Codigo de Procedimientos Familiares para el Estado de Coahuila de Zaragoza',
    'Procedimientos Familiares Coahuila',
    'coahuila',
    'Congreso del Estado Independiente, Libre y Soberano de Coahuila de Zaragoza',
    array['familiar'],
    'https://www.congresocoahuila.gob.mx/portal/leyes-estatales-vigentes/',
    'https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa03.pdf',
    'vigente',
    'Debe analizarse junto con la implementacion gradual del CNPCF.'
  ),
  (
    'codigo-penal-coahuila',
    'Codigo Penal de Coahuila de Zaragoza',
    'Codigo Penal Coahuila',
    'coahuila',
    'Congreso del Estado Independiente, Libre y Soberano de Coahuila de Zaragoza',
    array['penal'],
    'https://www.congresocoahuila.gob.mx/portal/leyes-estatales-vigentes/',
    'https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa08.pdf',
    'vigente',
    'Norma penal sustantiva estatal.'
  ),
  (
    'procesal-civil-coahuila',
    'Codigo Procesal Civil para el Estado de Coahuila de Zaragoza',
    'Procesal Civil Coahuila',
    'coahuila',
    'Congreso del Estado Independiente, Libre y Soberano de Coahuila de Zaragoza',
    array['civil'],
    'https://www.congresocoahuila.gob.mx/portal/leyes-estatales-vigentes/',
    'https://www.congresocoahuila.gob.mx/transparencia/03/Leyes_Coahuila/coa09.pdf',
    'vigente',
    'Debe verificarse la vigencia territorial y material frente al CNPCF antes de citarlo.'
  )
on conflict (slug) do update
set
  title = excluded.title,
  short_name = excluded.short_name,
  jurisdiction = excluded.jurisdiction,
  authority = excluded.authority,
  materias = excluded.materias,
  source_page_url = excluded.source_page_url,
  official_document_url = excluded.official_document_url,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

notify pgrst, 'reload schema';
