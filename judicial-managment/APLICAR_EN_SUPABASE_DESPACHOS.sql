/*
  # Despachos as workspaces

  - Adds despacho workspaces.
  - Adds collaborators and invitation codes.
  - Enforces a maximum of two despachos created by each user.
  - Adds despacho_id to business tables.
*/

create table if not exists despachos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists despacho_miembros (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references despachos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (despacho_id, user_id)
);

create table if not exists despacho_invitaciones (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references despachos(id) on delete cascade,
  codigo text unique not null,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  max_usos integer not null default 1 check (max_usos > 0),
  usos integer not null default 0 check (usos >= 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table despachos enable row level security;
alter table despacho_miembros enable row level security;
alter table despacho_invitaciones enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_despachos_updated_at on despachos;
create trigger set_despachos_updated_at
  before update on despachos
  for each row execute function public.set_updated_at();

create or replace function public.is_despacho_member(target_despacho_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.despacho_miembros
    where despacho_id = target_despacho_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.despacho_role(target_despacho_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.despacho_miembros
  where despacho_id = target_despacho_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_admin_despacho(target_despacho_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.despacho_role(target_despacho_id) in ('owner', 'admin');
$$;

create or replace function public.can_edit_despacho(target_despacho_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.despacho_role(target_despacho_id) in ('owner', 'admin', 'editor');
$$;

create or replace function public.create_despacho(despacho_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_count integer;
  new_despacho_id uuid;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  if nullif(trim(despacho_nombre), '') is null then
    raise exception 'El nombre del despacho es obligatorio.';
  end if;

  select count(*) into owned_count
  from public.despachos
  where owner_user_id = auth.uid();

  if owned_count >= 2 then
    raise exception 'Cada usuario puede crear un maximo de 2 despachos.';
  end if;

  select email into user_email from auth.users where id = auth.uid();

  insert into public.despachos (nombre, owner_user_id)
  values (trim(despacho_nombre), auth.uid())
  returning id into new_despacho_id;

  insert into public.despacho_miembros (despacho_id, user_id, email, role)
  values (new_despacho_id, auth.uid(), coalesce(user_email, ''), 'owner');

  return new_despacho_id;
end;
$$;

create or replace function public.join_despacho_by_code(invitation_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.despacho_invitaciones%rowtype;
  user_email text;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into invitation
  from public.despacho_invitaciones
  where upper(codigo) = upper(trim(invitation_code))
    and revoked = false
    and usos < max_usos
    and (expires_at is null or expires_at > now())
  limit 1;

  if invitation.id is null then
    raise exception 'Codigo de invitacion invalido o expirado.';
  end if;

  if exists (
    select 1
    from public.despacho_miembros
    where despacho_id = invitation.despacho_id
      and user_id = auth.uid()
  ) then
    return invitation.despacho_id;
  end if;

  select email into user_email from auth.users where id = auth.uid();

  insert into public.despacho_miembros (despacho_id, user_id, email, role)
  values (invitation.despacho_id, auth.uid(), coalesce(user_email, ''), invitation.role)
  on conflict (despacho_id, user_id) do nothing;

  update public.despacho_invitaciones
  set usos = usos + 1
  where id = invitation.id;

  return invitation.despacho_id;
end;
$$;

do $$
begin
  alter table clientes add column if not exists despacho_id uuid references despachos(id) on delete cascade;
  alter table expedientes add column if not exists despacho_id uuid references despachos(id) on delete cascade;
  alter table movimientos add column if not exists despacho_id uuid references despachos(id) on delete cascade;
  alter table cliente_movimientos add column if not exists despacho_id uuid references despachos(id) on delete cascade;
  alter table tribunal_laboral add column if not exists despacho_id uuid references despachos(id) on delete cascade;
exception
  when undefined_table then
    raise notice 'Business tables are not created yet. Run earlier migrations first.';
end $$;

create index if not exists idx_despacho_miembros_user_id on despacho_miembros(user_id);
create index if not exists idx_despacho_miembros_despacho_id on despacho_miembros(despacho_id);
create index if not exists idx_despacho_invitaciones_codigo on despacho_invitaciones(codigo);
create index if not exists idx_clientes_despacho_id on clientes(despacho_id);
create index if not exists idx_expedientes_despacho_id on expedientes(despacho_id);
create index if not exists idx_movimientos_despacho_id on movimientos(despacho_id);
create index if not exists idx_cliente_movimientos_despacho_id on cliente_movimientos(despacho_id);
create index if not exists idx_tribunal_laboral_despacho_id on tribunal_laboral(despacho_id);

drop policy if exists "Members can view their despachos" on despachos;
drop policy if exists "Despachos created through function" on despachos;
drop policy if exists "Owner or admin can update despacho" on despachos;
drop policy if exists "Members can view despacho members" on despacho_miembros;
drop policy if exists "Owner or admin can manage members" on despacho_miembros;
drop policy if exists "Owner or admin can remove members" on despacho_miembros;
drop policy if exists "Owner or admin can view invitations" on despacho_invitaciones;
drop policy if exists "Owner or admin can create invitations" on despacho_invitaciones;
drop policy if exists "Owner or admin can update invitations" on despacho_invitaciones;

create policy "Members can view their despachos"
  on despachos for select
  to authenticated
  using (public.is_despacho_member(id));

create policy "Despachos created through function"
  on despachos for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "Owner or admin can update despacho"
  on despachos for update
  to authenticated
  using (public.can_admin_despacho(id))
  with check (public.can_admin_despacho(id));

create policy "Members can view despacho members"
  on despacho_miembros for select
  to authenticated
  using (public.is_despacho_member(despacho_id));

create policy "Owner or admin can manage members"
  on despacho_miembros for update
  to authenticated
  using (public.can_admin_despacho(despacho_id) and role <> 'owner')
  with check (public.can_admin_despacho(despacho_id) and role <> 'owner');

create policy "Owner or admin can remove members"
  on despacho_miembros for delete
  to authenticated
  using (public.can_admin_despacho(despacho_id) and role <> 'owner');

create policy "Owner or admin can view invitations"
  on despacho_invitaciones for select
  to authenticated
  using (public.can_admin_despacho(despacho_id));

create policy "Owner or admin can create invitations"
  on despacho_invitaciones for insert
  to authenticated
  with check (public.can_admin_despacho(despacho_id) and created_by = auth.uid());

create policy "Owner or admin can update invitations"
  on despacho_invitaciones for update
  to authenticated
  using (public.can_admin_despacho(despacho_id))
  with check (public.can_admin_despacho(despacho_id));

drop policy if exists "Clientes owner or admin select" on clientes;
drop policy if exists "Clientes owner insert" on clientes;
drop policy if exists "Clientes owner or admin update" on clientes;
drop policy if exists "Clientes owner or admin delete" on clientes;
drop policy if exists "Expedientes owner or admin select" on expedientes;
drop policy if exists "Expedientes owner insert" on expedientes;
drop policy if exists "Expedientes owner or admin update" on expedientes;
drop policy if exists "Expedientes owner or admin delete" on expedientes;
drop policy if exists "Movimientos owner or admin select" on movimientos;
drop policy if exists "Movimientos owner insert" on movimientos;
drop policy if exists "Movimientos owner or admin update" on movimientos;
drop policy if exists "Movimientos owner or admin delete" on movimientos;
drop policy if exists "Cliente movimientos owner or admin select" on cliente_movimientos;
drop policy if exists "Cliente movimientos owner insert" on cliente_movimientos;
drop policy if exists "Cliente movimientos owner or admin update" on cliente_movimientos;
drop policy if exists "Cliente movimientos owner or admin delete" on cliente_movimientos;
drop policy if exists "Tribunal owner or admin select" on tribunal_laboral;
drop policy if exists "Tribunal owner insert" on tribunal_laboral;
drop policy if exists "Tribunal owner or admin update" on tribunal_laboral;
drop policy if exists "Tribunal owner or admin delete" on tribunal_laboral;
drop policy if exists "Clientes despacho select" on clientes;
drop policy if exists "Clientes despacho insert" on clientes;
drop policy if exists "Clientes despacho update" on clientes;
drop policy if exists "Clientes despacho delete" on clientes;
drop policy if exists "Expedientes despacho select" on expedientes;
drop policy if exists "Expedientes despacho insert" on expedientes;
drop policy if exists "Expedientes despacho update" on expedientes;
drop policy if exists "Expedientes despacho delete" on expedientes;
drop policy if exists "Movimientos despacho select" on movimientos;
drop policy if exists "Movimientos despacho insert" on movimientos;
drop policy if exists "Movimientos despacho update" on movimientos;
drop policy if exists "Movimientos despacho delete" on movimientos;
drop policy if exists "Cliente movimientos despacho select" on cliente_movimientos;
drop policy if exists "Cliente movimientos despacho insert" on cliente_movimientos;
drop policy if exists "Cliente movimientos despacho update" on cliente_movimientos;
drop policy if exists "Cliente movimientos despacho delete" on cliente_movimientos;
drop policy if exists "Tribunal despacho select" on tribunal_laboral;
drop policy if exists "Tribunal despacho insert" on tribunal_laboral;
drop policy if exists "Tribunal despacho update" on tribunal_laboral;
drop policy if exists "Tribunal despacho delete" on tribunal_laboral;

create policy "Clientes despacho select"
  on clientes for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Clientes despacho insert"
  on clientes for insert to authenticated
  with check (public.can_edit_despacho(despacho_id));
create policy "Clientes despacho update"
  on clientes for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));
create policy "Clientes despacho delete"
  on clientes for delete to authenticated
  using (public.can_admin_despacho(despacho_id));

create policy "Expedientes despacho select"
  on expedientes for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Expedientes despacho insert"
  on expedientes for insert to authenticated
  with check (public.can_edit_despacho(despacho_id));
create policy "Expedientes despacho update"
  on expedientes for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));
create policy "Expedientes despacho delete"
  on expedientes for delete to authenticated
  using (public.can_admin_despacho(despacho_id));

create policy "Movimientos despacho select"
  on movimientos for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Movimientos despacho insert"
  on movimientos for insert to authenticated
  with check (public.can_edit_despacho(despacho_id));
create policy "Movimientos despacho update"
  on movimientos for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));
create policy "Movimientos despacho delete"
  on movimientos for delete to authenticated
  using (public.can_admin_despacho(despacho_id));

create policy "Cliente movimientos despacho select"
  on cliente_movimientos for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Cliente movimientos despacho insert"
  on cliente_movimientos for insert to authenticated
  with check (public.can_edit_despacho(despacho_id));
create policy "Cliente movimientos despacho update"
  on cliente_movimientos for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));
create policy "Cliente movimientos despacho delete"
  on cliente_movimientos for delete to authenticated
  using (public.can_admin_despacho(despacho_id));

create policy "Tribunal despacho select"
  on tribunal_laboral for select to authenticated
  using (public.is_despacho_member(despacho_id));
create policy "Tribunal despacho insert"
  on tribunal_laboral for insert to authenticated
  with check (public.can_edit_despacho(despacho_id));
create policy "Tribunal despacho update"
  on tribunal_laboral for update to authenticated
  using (public.can_edit_despacho(despacho_id))
  with check (public.can_edit_despacho(despacho_id));
create policy "Tribunal despacho delete"
  on tribunal_laboral for delete to authenticated
  using (public.can_admin_despacho(despacho_id));

notify pgrst, 'reload schema';
