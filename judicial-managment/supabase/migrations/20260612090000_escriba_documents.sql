/*
  Escriba: rich legal documents, expediente links, and version history.
*/

create table if not exists public.escriba_documentos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  expediente_id uuid references public.expedientes(id) on delete set null,
  titulo text not null default 'Documento sin titulo',
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_html text not null default '<p></p>',
  plain_text text not null default '',
  page_size text not null default 'letter' check (page_size in ('letter', 'a4', 'legal')),
  orientation text not null default 'portrait' check (orientation in ('portrait', 'landscape')),
  margins jsonb not null default '{"top":25.4,"right":25.4,"bottom":25.4,"left":25.4}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'review', 'final')),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_escriba_documentos_despacho
  on public.escriba_documentos(despacho_id, updated_at desc);

create index if not exists idx_escriba_documentos_expediente
  on public.escriba_documentos(expediente_id, updated_at desc)
  where expediente_id is not null;

create table if not exists public.escriba_versiones (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.escriba_documentos(id) on delete cascade,
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  etiqueta text not null default 'Guardado manual',
  content_json jsonb not null,
  content_html text not null,
  plain_text text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (documento_id, version_number)
);

create index if not exists idx_escriba_versiones_documento
  on public.escriba_versiones(documento_id, version_number desc);

drop trigger if exists set_escriba_documentos_updated_at on public.escriba_documentos;
create trigger set_escriba_documentos_updated_at
  before update on public.escriba_documentos
  for each row execute function public.set_updated_at();

alter table public.escriba_documentos enable row level security;
alter table public.escriba_versiones enable row level security;

create policy "Despacho members can read Escriba documents"
  on public.escriba_documentos for select to authenticated
  using (public.is_despacho_member(despacho_id));

create policy "Despacho editors can create Escriba documents"
  on public.escriba_documentos for insert to authenticated
  with check (
    public.can_edit_despacho(despacho_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and (
      expediente_id is null
      or exists (
        select 1 from public.expedientes
        where id = expediente_id
          and despacho_id = escriba_documentos.despacho_id
      )
    )
  );

create policy "Despacho editors can update Escriba documents"
  on public.escriba_documentos for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (
    public.can_edit_despacho(despacho_id)
    and updated_by = auth.uid()
    and (
      expediente_id is null
      or exists (
        select 1 from public.expedientes
        where id = expediente_id
          and despacho_id = escriba_documentos.despacho_id
      )
    )
  );

create policy "Despacho editors can delete Escriba documents"
  on public.escriba_documentos for delete to authenticated
  using (public.can_edit_despacho(despacho_id));

create policy "Despacho members can read Escriba versions"
  on public.escriba_versiones for select to authenticated
  using (public.is_despacho_member(despacho_id));

create policy "Despacho editors can create Escriba versions"
  on public.escriba_versiones for insert to authenticated
  with check (
    public.can_edit_despacho(despacho_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.escriba_documentos
      where id = documento_id
        and despacho_id = escriba_versiones.despacho_id
    )
  );

notify pgrst, 'reload schema';
