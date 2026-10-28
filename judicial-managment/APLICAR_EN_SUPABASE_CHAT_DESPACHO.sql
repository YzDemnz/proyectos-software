create table if not exists public.despacho_chat_mensajes (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_despacho_chat_mensajes_despacho_created
  on public.despacho_chat_mensajes(despacho_id, created_at desc);

create index if not exists idx_despacho_chat_mensajes_sender
  on public.despacho_chat_mensajes(sender_user_id);

alter table public.despacho_chat_mensajes enable row level security;

drop policy if exists "Despacho members can read chat messages" on public.despacho_chat_mensajes;
create policy "Despacho members can read chat messages"
  on public.despacho_chat_mensajes
  for select
  to authenticated
  using (public.is_despacho_member(despacho_id));

drop policy if exists "Despacho members can send chat messages" on public.despacho_chat_mensajes;
create policy "Despacho members can send chat messages"
  on public.despacho_chat_mensajes
  for insert
  to authenticated
  with check (
    public.is_despacho_member(despacho_id)
    and sender_user_id = auth.uid()
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'despacho_chat_mensajes'
    )
  then
    alter publication supabase_realtime add table public.despacho_chat_mensajes;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
