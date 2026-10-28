/*
  # Calendario de audiencias

  - Adds calendario_eventos for despacho-scoped calendar items.
  - Lets editors create and update events.
  - Keeps event reads limited to despacho collaborators.
*/

create table if not exists calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references despachos(id) on delete cascade,
  expediente_id uuid references expedientes(id) on delete set null,
  movimiento_id uuid references movimientos(id) on delete cascade,
  titulo text not null,
  descripcion text not null default '',
  event_date date not null,
  event_time time,
  tipo text not null default 'audiencia' check (tipo in ('audiencia', 'vencimiento', 'recordatorio', 'otro')),
  notify_day_before boolean not null default true,
  notify_same_day boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table calendario_eventos enable row level security;

drop trigger if exists set_calendario_eventos_updated_at on calendario_eventos;
create trigger set_calendario_eventos_updated_at
  before update on calendario_eventos
  for each row execute function public.set_updated_at();

create index if not exists idx_calendario_eventos_despacho_id on calendario_eventos(despacho_id);
create index if not exists idx_calendario_eventos_event_date on calendario_eventos(event_date);
create index if not exists idx_calendario_eventos_expediente_id on calendario_eventos(expediente_id);
create index if not exists idx_calendario_eventos_movimiento_id on calendario_eventos(movimiento_id);

drop policy if exists "Calendario despacho select" on calendario_eventos;
drop policy if exists "Calendario despacho insert" on calendario_eventos;
drop policy if exists "Calendario despacho update" on calendario_eventos;
drop policy if exists "Calendario despacho delete" on calendario_eventos;

create policy "Calendario despacho select"
  on calendario_eventos for select
  to authenticated
  using (public.is_despacho_member(despacho_id));

create policy "Calendario despacho insert"
  on calendario_eventos for insert
  to authenticated
  with check (public.can_edit_despacho(despacho_id));

create policy "Calendario despacho update"
  on calendario_eventos for update
  to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));

create policy "Calendario despacho delete"
  on calendario_eventos for delete
  to authenticated
  using (public.can_edit_despacho(despacho_id));

notify pgrst, 'reload schema';
