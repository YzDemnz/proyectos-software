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
