-- Controlled AI model deployments and private-first drafting retrieval.
-- Model binaries are pulled from Ollama's registry; Supabase only distributes
-- signed-in deployment state and never arbitrary operating-system commands.

alter table public.juris_referencias
  add column if not exists document_kind text not null default '',
  add column if not exists matter text not null default '',
  add column if not exists keywords jsonb not null default '[]'::jsonb,
  add column if not exists priority integer not null default 100
    check (priority between 0 and 1000),
  add column if not exists is_default boolean not null default false;

create index if not exists idx_juris_referencias_private_search
  on public.juris_referencias (despacho_id, extraction_status, priority desc, created_at desc);

create or replace function public.search_juris_references(
  target_despacho_id uuid,
  search_text text,
  matter_filter text default null,
  document_kind_filter text default null,
  result_limit integer default 3
)
returns table (
  id uuid,
  title text,
  file_name text,
  document_kind text,
  matter text,
  keywords jsonb,
  extracted_text text,
  priority integer,
  is_default boolean,
  score integer,
  selection_reason text
)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select
      lower(trim(coalesce(search_text, ''))) as query,
      lower(trim(coalesce(matter_filter, ''))) as requested_matter,
      lower(trim(coalesce(document_kind_filter, ''))) as requested_kind
  ),
  ranked as (
    select
      reference.id,
      reference.title,
      reference.file_name,
      reference.document_kind,
      reference.matter,
      reference.keywords,
      reference.extracted_text,
      reference.priority,
      reference.is_default,
      (
        case when input.requested_matter <> '' and lower(reference.matter) = input.requested_matter then 40 else 0 end
        + case when input.requested_kind <> '' and lower(reference.document_kind) = input.requested_kind then 50 else 0 end
        + case when input.query <> '' and lower(reference.title) like '%' || input.query || '%' then 30 else 0 end
        + case when input.query <> '' and lower(reference.file_name) like '%' || input.query || '%' then 20 else 0 end
        + case when input.query <> '' and lower(reference.keywords::text) like '%' || input.query || '%' then 18 else 0 end
        + case when input.query <> '' and lower(left(reference.extracted_text, 60000)) like '%' || input.query || '%' then 12 else 0 end
        + coalesce((
          select count(*)::integer * 5
          from regexp_split_to_table(input.query, '[^[:alnum:]]+') as term
          where char_length(term) >= 4
            and lower(
              reference.title || ' ' || reference.file_name || ' ' ||
              reference.document_kind || ' ' || reference.matter || ' ' ||
              reference.keywords::text || ' ' || left(reference.extracted_text, 60000)
            ) like '%' || term || '%'
        ), 0)
        + least(reference.priority / 20, 25)
        + case when reference.is_default then 4 else 0 end
      )::integer as score
    from public.juris_referencias as reference
    cross join input
    where reference.despacho_id = target_despacho_id
      and reference.extraction_status = 'ready'
      and char_length(trim(reference.extracted_text)) > 0
  )
  select
    ranked.id,
    ranked.title,
    ranked.file_name,
    ranked.document_kind,
    ranked.matter,
    ranked.keywords,
    ranked.extracted_text,
    ranked.priority,
    ranked.is_default,
    ranked.score,
    case
      when ranked.score >= 50 then 'Formato privado con coincidencia fuerte de tipo o materia.'
      when ranked.score >= 20 then 'Formato privado con coincidencias en titulo, palabras clave o contenido.'
      when ranked.is_default then 'Formato privado predeterminado por el despacho.'
      else 'Referencia privada disponible en el despacho.'
    end as selection_reason
  from ranked
  where ranked.score >= 10 or ranked.is_default
  order by ranked.score desc, ranked.priority desc, ranked.title asc
  limit greatest(1, least(coalesce(result_limit, 3), 5));
$$;

grant execute on function public.search_juris_references(uuid, text, text, text, integer)
  to authenticated;

create table if not exists public.ai_model_deployments (
  id uuid primary key default gen_random_uuid(),
  release_version text not null check (release_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$'),
  channel text not null default 'stable' check (channel in ('laboratory', 'beta', 'stable')),
  platform text not null default 'all' check (platform in ('all', 'win32', 'darwin', 'linux')),
  model_tier text not null check (model_tier in ('low', 'medium', 'high', 'professional')),
  model_id text not null check (model_id in ('low', 'medium', 'high', 'professional')),
  constraint ai_model_deployments_tier_matches_model check (model_tier = model_id),
  title text not null check (char_length(title) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 2000),
  minimum_app_version text,
  rollout_percentage integer not null default 100 check (rollout_percentage between 1 and 100),
  auto_install_allowed boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'revoked')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_model_deployments_resolution
  on public.ai_model_deployments (status, channel, platform, model_tier, published_at desc);

alter table public.ai_model_deployments enable row level security;

drop policy if exists "Authenticated users can read published AI deployments"
  on public.ai_model_deployments;
create policy "Authenticated users can read published AI deployments"
  on public.ai_model_deployments
  for select
  to authenticated
  using (status = 'published');

-- Deliberately no client INSERT/UPDATE/DELETE policy. Deployments are written
-- only by the server-side Edge Function with the service role.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'ai_model_deployments'
     ) then
    alter publication supabase_realtime add table public.ai_model_deployments;
  end if;
end;
$$;

notify pgrst, 'reload schema';
