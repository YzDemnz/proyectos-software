create table if not exists public.document_adjuntos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  target_type text not null check (target_type in ('expediente', 'movimiento')),
  expediente_id uuid references public.expedientes(id) on delete cascade,
  movimiento_id uuid references public.movimientos(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  check (
    (target_type = 'expediente' and expediente_id is not null and movimiento_id is null)
    or
    (target_type = 'movimiento' and movimiento_id is not null and expediente_id is null)
  )
);

create index if not exists idx_document_adjuntos_despacho_id
  on public.document_adjuntos(despacho_id);

create index if not exists idx_document_adjuntos_expediente_id
  on public.document_adjuntos(expediente_id)
  where expediente_id is not null;

create index if not exists idx_document_adjuntos_movimiento_id
  on public.document_adjuntos(movimiento_id)
  where movimiento_id is not null;

create or replace function public.document_attachment_target_matches(
  target_type text,
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
  select case
    when target_type = 'expediente' then
      target_expediente_id is not null
      and target_movimiento_id is null
      and exists (
        select 1
        from public.expedientes
        where id = target_expediente_id
          and despacho_id = target_despacho_id
      )
    when target_type = 'movimiento' then
      target_movimiento_id is not null
      and target_expediente_id is null
      and exists (
        select 1
        from public.movimientos
        where id = target_movimiento_id
          and despacho_id = target_despacho_id
      )
    else false
  end;
$$;

alter table public.document_adjuntos enable row level security;

drop policy if exists "Despacho members can read document attachments" on public.document_adjuntos;
create policy "Despacho members can read document attachments"
  on public.document_adjuntos
  for select
  to authenticated
  using (public.is_despacho_member(despacho_id));

drop policy if exists "Despacho editors can create document attachments" on public.document_adjuntos;
create policy "Despacho editors can create document attachments"
  on public.document_adjuntos
  for insert
  to authenticated
  with check (
    public.can_edit_despacho(despacho_id)
    and uploaded_by = auth.uid()
    and public.document_attachment_target_matches(target_type, despacho_id, expediente_id, movimiento_id)
  );

drop policy if exists "Despacho editors can delete document attachments" on public.document_adjuntos;
create policy "Despacho editors can delete document attachments"
  on public.document_adjuntos
  for delete
  to authenticated
  using (public.can_edit_despacho(despacho_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'despacho-document-files',
  'despacho-document-files',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Despacho members can read document files" on storage.objects;
drop policy if exists "Despacho editors can upload document files" on storage.objects;
drop policy if exists "Despacho editors can delete document files" on storage.objects;

create policy "Despacho members can read document files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_despacho_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Despacho editors can upload document files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_edit_despacho(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Despacho editors can delete document files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_edit_despacho(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'document_adjuntos'
    )
  then
    alter publication supabase_realtime add table public.document_adjuntos;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
