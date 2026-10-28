create table if not exists public.despacho_chat_adjuntos (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.despacho_chat_mensajes(id) on delete cascade,
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_despacho_chat_adjuntos_message_id
  on public.despacho_chat_adjuntos(message_id);

create index if not exists idx_despacho_chat_adjuntos_despacho_id
  on public.despacho_chat_adjuntos(despacho_id);

alter table public.despacho_chat_adjuntos enable row level security;

drop policy if exists "Despacho members can read chat attachments" on public.despacho_chat_adjuntos;
create policy "Despacho members can read chat attachments"
  on public.despacho_chat_adjuntos
  for select
  to authenticated
  using (public.is_despacho_member(despacho_id));

drop policy if exists "Despacho members can create chat attachments" on public.despacho_chat_adjuntos;
create policy "Despacho members can create chat attachments"
  on public.despacho_chat_adjuntos
  for insert
  to authenticated
  with check (
    public.is_despacho_member(despacho_id)
    and uploaded_by = auth.uid()
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'despacho-chat-files',
  'despacho-chat-files',
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

drop policy if exists "Despacho members can read chat files" on storage.objects;
drop policy if exists "Despacho members can upload chat files" on storage.objects;

create policy "Despacho members can read chat files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'despacho-chat-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_despacho_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

create policy "Despacho members can upload chat files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'despacho-chat-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_despacho_member(((storage.foldername(name))[1])::uuid)
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
        and tablename = 'despacho_chat_adjuntos'
    )
  then
    alter publication supabase_realtime add table public.despacho_chat_adjuntos;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
