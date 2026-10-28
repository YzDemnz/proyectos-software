-- Judicial Managment complete Supabase schema
-- Generated locally from supabase/migrations in order.

/*
  # Create Legal Management System Schema

  1. New Tables
    - `clientes`
      - `id` (uuid, primary key)
      - `nombre` (text, cliente name)
      - `email` (text, nullable)
      - `telefono` (text, nullable)
      - `direccion` (text, nullable)
      - `created_at` (timestamp)
    
    - `expedientes`
      - `id` (uuid, primary key)
      - `numero_expediente` (text, unique expediente number)
      - `partes` (text, parties involved)
      - `juzgado` (text, court name)
      - `estatus` (text, case status)
      - `notas` (text, notes for pending items)
      - `cliente_id` (uuid, foreign key to clientes)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `movimientos`
      - `id` (uuid, primary key)
      - `expediente_id` (uuid, foreign key to expedientes)
      - `fecha` (date)
      - `tipo` (text, movement type)
      - `descripcion` (text)
      - `created_at` (timestamp)
    
    - `tribunal_laboral`
      - `id` (uuid, primary key)
      - `nombre` (text, tribunal name)
      - `direccion` (text)
      - `telefono` (text, nullable)
      - `email` (text, nullable)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create clientes table
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text,
  telefono text,
  direccion text,
  created_at timestamptz DEFAULT now()
);

-- Create expedientes table
CREATE TABLE IF NOT EXISTS expedientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_expediente text UNIQUE NOT NULL,
  partes text NOT NULL,
  juzgado text NOT NULL,
  estatus text NOT NULL DEFAULT 'Activo',
  notas text DEFAULT '',
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create movimientos table
CREATE TABLE IF NOT EXISTS movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid REFERENCES expedientes(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL,
  descripcion text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create tribunal_laboral table
CREATE TABLE IF NOT EXISTS tribunal_laboral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  direccion text NOT NULL,
  telefono text,
  email text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribunal_laboral ENABLE ROW LEVEL SECURITY;

-- Create policies for clientes
CREATE POLICY "Users can view all clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert clientes"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete clientes"
  ON clientes FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for expedientes
CREATE POLICY "Users can view all expedientes"
  ON expedientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert expedientes"
  ON expedientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update expedientes"
  ON expedientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete expedientes"
  ON expedientes FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for movimientos
CREATE POLICY "Users can view all movimientos"
  ON movimientos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert movimientos"
  ON movimientos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update movimientos"
  ON movimientos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete movimientos"
  ON movimientos FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for tribunal_laboral
CREATE POLICY "Users can view all tribunales"
  ON tribunal_laboral FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert tribunales"
  ON tribunal_laboral FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update tribunales"
  ON tribunal_laboral FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete tribunales"
  ON tribunal_laboral FOR DELETE
  TO authenticated
  USING (true);

/*
  # Update Schema for New Requirements

  1. Modified Tables
    - `clientes`
      - Remove: email, telefono, direccion
      - Add: monto_pactado (agreed fees), total_adeudo (total debt)
    
    - `expedientes`
      - Remove: notas column (integrate with movimientos)
    
    - `movimientos`
      - Add: is_payment (boolean to differentiate movements from transactions)
      - Rename to also handle cargo/abono operations
    
    - `tribunal_laboral`
      - Add: hoja_no_conciliacion (boolean)

  2. New Tables
    - `cliente_movimientos` (for cargo/abono in clientes)
      - `id` (uuid, primary key)
      - `cliente_id` (uuid, foreign key)
      - `tipo` (text: 'cargo' or 'abono')
      - `monto` (numeric)
      - `descripcion` (text)
      - `created_at` (timestamp)

  3. Updates
    - Update RLS policies for new structure
*/

-- Modify clientes table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'email'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS email;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'telefono'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS telefono;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'direccion'
  ) THEN
    ALTER TABLE clientes DROP COLUMN IF EXISTS direccion;
  END IF;
END $$;

-- Add new columns to clientes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'monto_pactado'
  ) THEN
    ALTER TABLE clientes ADD COLUMN monto_pactado numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'total_adeudo'
  ) THEN
    ALTER TABLE clientes ADD COLUMN total_adeudo numeric DEFAULT 0;
  END IF;
END $$;

-- Remove notas from expedientes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expedientes' AND column_name = 'notas'
  ) THEN
    ALTER TABLE expedientes DROP COLUMN notas;
  END IF;
END $$;

-- Add is_payment to movimientos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movimientos' AND column_name = 'is_payment'
  ) THEN
    ALTER TABLE movimientos ADD COLUMN is_payment boolean DEFAULT false;
  END IF;
END $$;

-- Create cliente_movimientos table
CREATE TABLE IF NOT EXISTS cliente_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('cargo', 'abono')),
  monto numeric NOT NULL,
  descripcion text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on cliente_movimientos
ALTER TABLE cliente_movimientos ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for cliente_movimientos
CREATE POLICY "Users can view all cliente_movimientos"
  ON cliente_movimientos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert cliente_movimientos"
  ON cliente_movimientos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update cliente_movimientos"
  ON cliente_movimientos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete cliente_movimientos"
  ON cliente_movimientos FOR DELETE
  TO authenticated
  USING (true);

-- Add hoja_no_conciliacion to tribunal_laboral
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tribunal_laboral' AND column_name = 'hoja_no_conciliacion'
  ) THEN
    ALTER TABLE tribunal_laboral ADD COLUMN hoja_no_conciliacion boolean DEFAULT false;
  END IF;
END $$;

/*
  # Security and Torreon courts update

  1. Security model
    - Adds profiles with explicit roles: owner, admin, user.
    - Adds owner_user_id columns to business tables.
    - Replaces broad "all authenticated users" policies with owner/admin policies.
    - Adds an audit_log table for sensitive events.

  2. Expedientes
    - Adds materia and tipo_juicio fields.

  Note: this intentionally does not add a hidden backdoor. Emergency access should be
  handled through a documented owner/admin role in app_profiles and audited actions.
*/

create table if not exists app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('owner', 'admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_profiles enable row level security;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.app_profiles where id = auth.uid()),
    'user'
  );
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('owner', 'admin');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

drop trigger if exists set_app_profiles_updated_at on app_profiles;
create trigger set_app_profiles_updated_at
  before update on app_profiles
  for each row execute function public.set_updated_at();

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

do $$
begin
  alter table clientes add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
  alter table expedientes add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
  alter table movimientos add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
  alter table tribunal_laboral add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
  alter table cliente_movimientos add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
  alter table expedientes add column if not exists materia text;
  alter table expedientes add column if not exists tipo_juicio text;

  alter table clientes alter column owner_user_id set default auth.uid();
  alter table expedientes alter column owner_user_id set default auth.uid();
  alter table movimientos alter column owner_user_id set default auth.uid();
  alter table tribunal_laboral alter column owner_user_id set default auth.uid();
  alter table cliente_movimientos alter column owner_user_id set default auth.uid();
exception
  when undefined_table then
    raise notice 'Base tables are not created yet. Run previous migrations first.';
end $$;

create index if not exists idx_clientes_owner_user_id on clientes(owner_user_id);
create index if not exists idx_expedientes_owner_user_id on expedientes(owner_user_id);
create index if not exists idx_movimientos_owner_user_id on movimientos(owner_user_id);
create index if not exists idx_cliente_movimientos_owner_user_id on cliente_movimientos(owner_user_id);
create index if not exists idx_tribunal_laboral_owner_user_id on tribunal_laboral(owner_user_id);

drop policy if exists "Users can view all clientes" on clientes;
drop policy if exists "Users can insert clientes" on clientes;
drop policy if exists "Users can update clientes" on clientes;
drop policy if exists "Users can delete clientes" on clientes;
drop policy if exists "Users can view all expedientes" on expedientes;
drop policy if exists "Users can insert expedientes" on expedientes;
drop policy if exists "Users can update expedientes" on expedientes;
drop policy if exists "Users can delete expedientes" on expedientes;
drop policy if exists "Users can view all movimientos" on movimientos;
drop policy if exists "Users can insert movimientos" on movimientos;
drop policy if exists "Users can update movimientos" on movimientos;
drop policy if exists "Users can delete movimientos" on movimientos;
drop policy if exists "Users can view all cliente_movimientos" on cliente_movimientos;
drop policy if exists "Users can insert cliente_movimientos" on cliente_movimientos;
drop policy if exists "Users can update cliente_movimientos" on cliente_movimientos;
drop policy if exists "Users can delete cliente_movimientos" on cliente_movimientos;
drop policy if exists "Users can view all tribunales" on tribunal_laboral;
drop policy if exists "Users can insert tribunales" on tribunal_laboral;
drop policy if exists "Users can update tribunales" on tribunal_laboral;
drop policy if exists "Users can delete tribunales" on tribunal_laboral;

create policy "Profiles can read their own profile or admin can read all"
  on app_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_owner_or_admin());

create policy "Only owner can change roles"
  on app_profiles for update
  to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

create policy "Audit log visible to owner and admins"
  on audit_log for select
  to authenticated
  using (public.is_owner_or_admin());

create policy "Audit log insert for authenticated users"
  on audit_log for insert
  to authenticated
  with check (actor_user_id = auth.uid());

create policy "Clientes owner or admin select"
  on clientes for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Clientes owner insert"
  on clientes for insert
  to authenticated
  with check (coalesce(owner_user_id, auth.uid()) = auth.uid());

create policy "Clientes owner or admin update"
  on clientes for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin())
  with check (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Clientes owner or admin delete"
  on clientes for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Expedientes owner or admin select"
  on expedientes for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Expedientes owner insert"
  on expedientes for insert
  to authenticated
  with check (coalesce(owner_user_id, auth.uid()) = auth.uid());

create policy "Expedientes owner or admin update"
  on expedientes for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin())
  with check (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Expedientes owner or admin delete"
  on expedientes for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Movimientos owner or admin select"
  on movimientos for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Movimientos owner insert"
  on movimientos for insert
  to authenticated
  with check (coalesce(owner_user_id, auth.uid()) = auth.uid());

create policy "Movimientos owner or admin update"
  on movimientos for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin())
  with check (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Movimientos owner or admin delete"
  on movimientos for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Cliente movimientos owner or admin select"
  on cliente_movimientos for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Cliente movimientos owner insert"
  on cliente_movimientos for insert
  to authenticated
  with check (coalesce(owner_user_id, auth.uid()) = auth.uid());

create policy "Cliente movimientos owner or admin update"
  on cliente_movimientos for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin())
  with check (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Cliente movimientos owner or admin delete"
  on cliente_movimientos for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Tribunal owner or admin select"
  on tribunal_laboral for select
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Tribunal owner insert"
  on tribunal_laboral for insert
  to authenticated
  with check (coalesce(owner_user_id, auth.uid()) = auth.uid());

create policy "Tribunal owner or admin update"
  on tribunal_laboral for update
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin())
  with check (owner_user_id = auth.uid() or public.is_owner_or_admin());

create policy "Tribunal owner or admin delete"
  on tribunal_laboral for delete
  to authenticated
  using (owner_user_id = auth.uid() or public.is_owner_or_admin());


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

drop trigger if exists set_expedientes_updated_at on public.expedientes;
create trigger set_expedientes_updated_at
  before update on public.expedientes
  for each row execute function public.set_updated_at();

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

-- Chat simple por despacho.
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

-- Adjuntos privados en chat del despacho.
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

-- Adjuntos privados de expedientes y movimientos.
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

-- Perfiles visibles de colaboradores.
alter table public.despacho_miembros
  add column if not exists display_name text,
  add column if not exists profile_color text not null default '#1D4ED8',
  add column if not exists avatar_url text,
  add column if not exists profile_updated_at timestamptz;

update public.despacho_miembros
set profile_color = '#1D4ED8'
where profile_color is null or profile_color = '';

do $$
begin
  alter table public.despacho_miembros
    add constraint despacho_miembros_profile_color_check
    check (profile_color ~ '^#[0-9A-Fa-f]{6}$');
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile avatars are public" on storage.objects;
drop policy if exists "Authenticated users can upload profile avatars" on storage.objects;
drop policy if exists "Authenticated users can update profile avatars" on storage.objects;

create policy "Profile avatars are public"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

create policy "Authenticated users can upload profile avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-avatars');

create policy "Authenticated users can update profile avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-avatars')
  with check (bucket_id = 'profile-avatars');

create or replace function public.update_my_despacho_profile(
  target_member_id uuid,
  profile_display_name text,
  profile_color_value text,
  profile_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.despacho_miembros%rowtype;
  clean_display_name text := nullif(trim(profile_display_name), '');
  clean_profile_color text := upper(coalesce(nullif(trim(profile_color_value), ''), '#1D4ED8'));
  clean_avatar_url text := nullif(trim(profile_avatar_url), '');
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into target_member
  from public.despacho_miembros
  where id = target_member_id
  for update;

  if target_member.id is null then
    raise exception 'Colaborador no encontrado.';
  end if;

  if target_member.user_id <> auth.uid() then
    raise exception 'Solo puedes editar tu propio perfil visible.';
  end if;

  if clean_display_name is not null and length(clean_display_name) > 60 then
    raise exception 'El nombre visible debe tener 60 caracteres o menos.';
  end if;

  if clean_profile_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Color invalido.';
  end if;

  update public.despacho_miembros
  set
    display_name = clean_display_name,
    profile_color = clean_profile_color,
    avatar_url = clean_avatar_url,
    profile_updated_at = now()
  where id = target_member_id;
end;
$$;

grant execute on function public.update_my_despacho_profile(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Invitaciones: codigo diario general y nuevos colaboradores en solo lectura.
alter table public.despacho_invitaciones
  add column if not exists valid_on date;

update public.despacho_invitaciones
set valid_on = coalesce(valid_on, (created_at at time zone 'America/Mexico_City')::date);

alter table public.despacho_invitaciones
  alter column valid_on set default ((now() at time zone 'America/Mexico_City')::date);

alter table public.despacho_invitaciones
  alter column valid_on set not null;

alter table public.despacho_invitaciones
  alter column role set default 'viewer';

update public.despacho_invitaciones
set revoked = true
where revoked = false;

create unique index if not exists idx_despacho_invitaciones_daily_active
  on public.despacho_invitaciones(despacho_id, valid_on)
  where revoked = false;

create or replace function public.build_despacho_invitation_code()
returns text
language sql
volatile
as $$
  select 'JM-'
    || substr(upper(md5(gen_random_uuid()::text || clock_timestamp()::text)), 1, 4)
    || '-'
    || substr(upper(md5(gen_random_uuid()::text || random()::text)), 1, 4);
$$;

create or replace function public.get_daily_despacho_code(target_despacho_id uuid)
returns table(codigo text, expires_at timestamptz, valid_on date)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Mexico_City')::date;
  expires_at_value timestamptz := ((today + 1)::timestamp at time zone 'America/Mexico_City');
  next_code text;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  if not public.can_admin_despacho(target_despacho_id) then
    raise exception 'Solo propietario o administrador puede generar codigos.';
  end if;

  update public.despacho_invitaciones di
  set revoked = true
  where di.despacho_id = target_despacho_id
    and di.revoked = false
    and (di.valid_on <> today or di.expires_at is null or di.expires_at <= now());

  return query
  select di.codigo, di.expires_at, di.valid_on
  from public.despacho_invitaciones di
  where di.despacho_id = target_despacho_id
    and di.revoked = false
    and di.valid_on = today
    and di.expires_at > now()
  order by di.created_at desc
  limit 1;

  if found then
    return;
  end if;

  loop
    next_code := public.build_despacho_invitation_code();

    begin
      insert into public.despacho_invitaciones (
        despacho_id,
        codigo,
        role,
        max_usos,
        usos,
        expires_at,
        valid_on,
        revoked,
        created_by
      )
      values (
        target_despacho_id,
        next_code,
        'viewer',
        1000000,
        0,
        expires_at_value,
        today,
        false,
        auth.uid()
      )
      returning despacho_invitaciones.codigo,
        despacho_invitaciones.expires_at,
        despacho_invitaciones.valid_on
      into codigo, expires_at, valid_on;

      return next;
      return;
    exception
      when unique_violation then
        next_code := null;
    end;
  end loop;
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
  target_despacho public.despachos%rowtype;
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
    and (valid_on is null or valid_on = (now() at time zone 'America/Mexico_City')::date)
  limit 1;

  if invitation.id is null then
    raise exception 'Codigo de invitacion invalido o expirado.';
  end if;

  select * into target_despacho
  from public.despachos
  where id = invitation.despacho_id;

  if target_despacho.id is null or target_despacho.deleted_at is not null then
    raise exception 'Este despacho no esta disponible.';
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
  values (invitation.despacho_id, auth.uid(), coalesce(user_email, ''), 'viewer')
  on conflict (despacho_id, user_id) do nothing;

  update public.despacho_invitaciones
  set usos = usos + 1
  where id = invitation.id;

  return invitation.despacho_id;
end;
$$;

create or replace function public.update_despacho_member_role(target_member_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.despacho_miembros%rowtype;
  actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  if new_role not in ('admin', 'editor', 'viewer') then
    raise exception 'Rol no permitido.';
  end if;

  select * into target_member
  from public.despacho_miembros
  where id = target_member_id
  for update;

  if target_member.id is null then
    raise exception 'Colaborador no encontrado.';
  end if;

  if target_member.role = 'owner' or new_role = 'owner' then
    raise exception 'El propietario no se puede cambiar desde colaboradores.';
  end if;

  actor_role := public.despacho_role(target_member.despacho_id);

  if actor_role = 'owner' then
    update public.despacho_miembros
    set role = new_role
    where id = target_member_id;
    return;
  end if;

  if actor_role = 'admin' then
    if target_member.role = 'admin' or new_role = 'admin' then
      raise exception 'Solo el propietario puede asignar o modificar administradores.';
    end if;

    update public.despacho_miembros
    set role = new_role
    where id = target_member_id;
    return;
  end if;

  raise exception 'No tienes permiso para cambiar colaboradores.';
end;
$$;

drop policy if exists "Owner or admin can manage members" on public.despacho_miembros;
drop policy if exists "Owner can manage member roles" on public.despacho_miembros;
drop policy if exists "Admin can manage editor viewer roles" on public.despacho_miembros;
drop policy if exists "Owner or admin can remove members" on public.despacho_miembros;
drop policy if exists "Owner can remove members" on public.despacho_miembros;
drop policy if exists "Admin can remove editor viewer members" on public.despacho_miembros;

create policy "Owner can manage member roles"
  on public.despacho_miembros for update
  to authenticated
  using (public.despacho_role(despacho_id) = 'owner' and role <> 'owner')
  with check (public.despacho_role(despacho_id) = 'owner' and role <> 'owner');

create policy "Admin can manage editor viewer roles"
  on public.despacho_miembros for update
  to authenticated
  using (public.despacho_role(despacho_id) = 'admin' and role in ('editor', 'viewer'))
  with check (public.despacho_role(despacho_id) = 'admin' and role in ('editor', 'viewer'));

create policy "Owner can remove members"
  on public.despacho_miembros for delete
  to authenticated
  using (public.despacho_role(despacho_id) = 'owner' and role <> 'owner');

create policy "Admin can remove editor viewer members"
  on public.despacho_miembros for delete
  to authenticated
  using (public.despacho_role(despacho_id) = 'admin' and role in ('editor', 'viewer'));

grant execute on function public.get_daily_despacho_code(uuid) to authenticated;
grant execute on function public.update_despacho_member_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';


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

-- Judicial Managment: papelera de despachos con recuperacion de 4 dias.
-- Ejecutar en Supabase SQL Editor si la funcion no existe.

do $$
begin
  alter table despachos add column if not exists deleted_at timestamptz;
  alter table despachos add column if not exists delete_after timestamptz;
  alter table despachos add column if not exists deletion_requested_by uuid references auth.users(id) on delete set null;
exception
  when undefined_table then
    raise notice 'Despachos table is not created yet. Run earlier migrations first.';
end $$;

create index if not exists idx_despachos_deleted_at on despachos(deleted_at);
create index if not exists idx_despachos_delete_after on despachos(delete_after);

create or replace function public.request_despacho_deletion(target_despacho_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_despacho public.despachos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into target_despacho
  from public.despachos
  where id = target_despacho_id
  for update;

  if target_despacho.id is null then
    raise exception 'Despacho no encontrado.';
  end if;

  if target_despacho.owner_user_id <> auth.uid() then
    raise exception 'Solo el propietario puede eliminar este despacho.';
  end if;

  if target_despacho.deleted_at is not null then
    return;
  end if;

  update public.despachos
  set
    deleted_at = now(),
    delete_after = now() + interval '4 days',
    deletion_requested_by = auth.uid(),
    updated_at = now()
  where id = target_despacho_id;

  update public.despacho_invitaciones
  set revoked = true
  where despacho_id = target_despacho_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'despacho_deletion_requested',
    'despachos',
    target_despacho_id,
    jsonb_build_object('delete_after', now() + interval '4 days')
  );
end;
$$;

create or replace function public.restore_deleted_despacho(target_despacho_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_despacho public.despachos%rowtype;
  active_owned_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into target_despacho
  from public.despachos
  where id = target_despacho_id
  for update;

  if target_despacho.id is null then
    raise exception 'Despacho no encontrado.';
  end if;

  if target_despacho.owner_user_id <> auth.uid() then
    raise exception 'Solo el propietario puede recuperar este despacho.';
  end if;

  if target_despacho.deleted_at is null then
    return;
  end if;

  if target_despacho.delete_after <= now() then
    raise exception 'El periodo de recuperacion ya termino.';
  end if;

  select count(*) into active_owned_count
  from public.despachos
  where owner_user_id = auth.uid()
    and deleted_at is null;

  if active_owned_count >= 2 then
    raise exception 'No puedes recuperar este despacho porque ya tienes 2 despachos activos.';
  end if;

  update public.despachos
  set
    deleted_at = null,
    delete_after = null,
    deletion_requested_by = null,
    updated_at = now()
  where id = target_despacho_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'despacho_restored',
    'despachos',
    target_despacho_id,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.purge_expired_deleted_despachos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  with deleted as (
    delete from public.despachos
    where deleted_at is not null
      and delete_after <= now()
    returning id
  )
  select count(*) into purged_count from deleted;

  return purged_count;
end;
$$;

grant execute on function public.request_despacho_deletion(uuid) to authenticated;
grant execute on function public.restore_deleted_despacho(uuid) to authenticated;
grant execute on function public.purge_expired_deleted_despachos() to authenticated;

notify pgrst, 'reload schema';

-- Laboral: conciliacion, junta local y tribunal laboral.
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

