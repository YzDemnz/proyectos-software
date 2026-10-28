create table if not exists public.laboral_asuntos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  seccion text not null check (seccion in ('conciliacion', 'junta_local', 'tribunal_laboral')),
  numero_expediente text,
  partes text not null,
  procedimiento text check (procedimiento in ('normal', 'especial')),
  fecha_conciliacion date,
  hoja_conciliacion boolean,
  estatus text not null default 'Activo',
  notas text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint laboral_asuntos_shape_check check (
    (
      seccion = 'conciliacion'
      and numero_expediente is null
      and procedimiento is null
    )
    or
    (
      seccion in ('junta_local', 'tribunal_laboral')
      and numero_expediente is not null
      and procedimiento is not null
      and fecha_conciliacion is null
      and hoja_conciliacion is null
    )
  )
);

create index if not exists idx_laboral_asuntos_despacho_id on public.laboral_asuntos(despacho_id);
create index if not exists idx_laboral_asuntos_seccion on public.laboral_asuntos(seccion);
create index if not exists idx_laboral_asuntos_numero on public.laboral_asuntos(numero_expediente);
create index if not exists idx_laboral_asuntos_fecha_conciliacion on public.laboral_asuntos(fecha_conciliacion);

drop trigger if exists laboral_asuntos_set_updated_at on public.laboral_asuntos;
create trigger laboral_asuntos_set_updated_at
  before update on public.laboral_asuntos
  for each row execute function public.set_updated_at();

alter table public.laboral_asuntos enable row level security;

drop policy if exists "Despacho members can read laboral asuntos" on public.laboral_asuntos;
create policy "Despacho members can read laboral asuntos"
  on public.laboral_asuntos
  for select
  using (public.is_despacho_member(despacho_id));

drop policy if exists "Despacho editors can insert laboral asuntos" on public.laboral_asuntos;
create policy "Despacho editors can insert laboral asuntos"
  on public.laboral_asuntos
  for insert
  with check (public.can_edit_despacho(despacho_id));

drop policy if exists "Despacho editors can update laboral asuntos" on public.laboral_asuntos;
create policy "Despacho editors can update laboral asuntos"
  on public.laboral_asuntos
  for update
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));

drop policy if exists "Despacho editors can delete laboral asuntos" on public.laboral_asuntos;
create policy "Despacho editors can delete laboral asuntos"
  on public.laboral_asuntos
  for delete
  using (public.can_edit_despacho(despacho_id));

notify pgrst, 'reload schema';
