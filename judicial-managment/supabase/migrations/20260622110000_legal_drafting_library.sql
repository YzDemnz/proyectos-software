create table if not exists public.legal_drafting_examples (
  id text primary key,
  title text not null,
  kind text not null,
  matter text not null,
  keywords jsonb not null default '[]'::jsonb,
  structure jsonb not null default '[]'::jsonb,
  source_excerpt text not null,
  sanitized_docx_path text,
  redaction_counts jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  library_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_legal_drafting_examples_active_matter
  on public.legal_drafting_examples (is_active, matter);

alter table public.legal_drafting_examples enable row level security;

drop policy if exists "Authenticated users can read sanitized drafting examples" on public.legal_drafting_examples;
create policy "Authenticated users can read sanitized drafting examples"
  on public.legal_drafting_examples
  for select
  to authenticated
  using (is_active = true);

create or replace function public.search_drafting_examples(
  search_text text,
  matter_filter text default null,
  result_limit integer default 1
)
returns table (
  id text,
  title text,
  kind text,
  matter text,
  keywords jsonb,
  structure jsonb,
  source_excerpt text,
  sanitized_docx_path text,
  redaction_counts jsonb,
  score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with search_input as (
    select lower(coalesce(search_text, '')) as query,
           lower(coalesce(matter_filter, '')) as requested_matter
  )
  select
    example.id,
    example.title,
    example.kind,
    example.matter,
    example.keywords,
    example.structure,
    example.source_excerpt,
    example.sanitized_docx_path,
    example.redaction_counts,
    (
      case when input.requested_matter <> '' and lower(example.matter) = input.requested_matter then 12 else 0 end
      + case when input.query like '%' || lower(example.kind) || '%' then 10 else 0 end
      + case when lower(example.title) like '%' || input.query || '%' then 4 else 0 end
      + case when lower(example.keywords::text) like '%' || input.query || '%' then 3 else 0 end
    )::integer as score
  from public.legal_drafting_examples as example
  cross join search_input as input
  where example.is_active = true
  order by score desc, example.updated_at desc, example.title asc
  limit greatest(1, least(coalesce(result_limit, 1), 3));
$$;

grant execute on function public.search_drafting_examples(text, text, integer) to authenticated;

notify pgrst, 'reload schema';
