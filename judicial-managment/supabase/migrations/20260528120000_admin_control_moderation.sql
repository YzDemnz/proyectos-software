/*
  # Admin control, subscriptions, usage and moderation

  Adds controlled admin operations for the private beta:
  - account status: active, disabled, banned
  - subscription status for manual Mercado Pago validation
  - basic app usage seconds and last seen timestamp
  - moderation flags for despacho chat review

  The privileged functions are intentionally limited to the documented primary
  owner account and they write to audit_log.
*/

alter table public.app_profiles add column if not exists account_status text default 'active';
alter table public.app_profiles add column if not exists subscription_status text default 'trial';
alter table public.app_profiles add column if not exists subscription_provider text default 'mercado_pago';
alter table public.app_profiles add column if not exists subscription_reference text;
alter table public.app_profiles add column if not exists trial_started_at timestamptz;
alter table public.app_profiles add column if not exists trial_ends_at timestamptz;
alter table public.app_profiles add column if not exists ban_until timestamptz;
alter table public.app_profiles add column if not exists ban_reason text;
alter table public.app_profiles add column if not exists disabled_reason text;
alter table public.app_profiles add column if not exists last_seen_at timestamptz;
alter table public.app_profiles add column if not exists usage_seconds bigint default 0;

update public.app_profiles
set
  account_status = coalesce(account_status, 'active'),
  subscription_status = coalesce(subscription_status, 'trial'),
  subscription_provider = coalesce(subscription_provider, 'mercado_pago'),
  usage_seconds = coalesce(usage_seconds, 0)
where
  account_status is null
  or subscription_status is null
  or subscription_provider is null
  or usage_seconds is null;

update public.app_profiles profile
set
  trial_started_at = coalesce(profile.trial_started_at, auth_user.created_at),
  trial_ends_at = coalesce(profile.trial_ends_at, auth_user.created_at + interval '30 days')
from auth.users auth_user
where auth_user.id = profile.id;

alter table public.app_profiles alter column account_status set not null;
alter table public.app_profiles alter column subscription_status set not null;
alter table public.app_profiles alter column usage_seconds set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_profiles_account_status_check'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_account_status_check
      check (account_status in ('active', 'disabled', 'banned'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'app_profiles_subscription_status_check'
  ) then
    alter table public.app_profiles
      add constraint app_profiles_subscription_status_check
      check (subscription_status in ('trial', 'active', 'past_due', 'canceled', 'manual'));
  end if;
end $$;

create or replace function public.primary_owner_email()
returns text
language sql
stable
as $$
  select 'marod_legal@outlook.com'::text;
$$;

create or replace function public.is_primary_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles profile
    where profile.id = auth.uid()
      and profile.role = 'owner'
      and lower(coalesce(profile.email, auth.jwt() ->> 'email', '')) = public.primary_owner_email()
  );
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_profiles (
    id,
    email,
    role,
    account_status,
    subscription_status,
    subscription_provider,
    trial_started_at,
    trial_ends_at
  )
  values (
    new.id,
    new.email,
    'user',
    'active',
    'trial',
    'mercado_pago',
    new.created_at,
    new.created_at + interval '30 days'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    trial_started_at = coalesce(public.app_profiles.trial_started_at, excluded.trial_started_at),
    trial_ends_at = coalesce(public.app_profiles.trial_ends_at, excluded.trial_ends_at);

  return new;
end;
$$;

create or replace function public.track_app_usage(delta_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_delta integer;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  safe_delta := greatest(1, least(coalesce(delta_seconds, 60), 3600));

  update public.app_profiles
  set
    usage_seconds = coalesce(usage_seconds, 0) + safe_delta,
    last_seen_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.admin_update_account_status(
  target_user_id uuid,
  new_status text,
  reason text default null,
  ban_days integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(new_status));
  clean_reason text := nullif(trim(coalesce(reason, '')), '');
  effective_ban_until timestamptz;
begin
  if not public.is_primary_owner() then
    raise exception 'Acceso reservado al administrador principal.';
  end if;

  if clean_status not in ('active', 'disabled', 'banned') then
    raise exception 'Estatus de cuenta no valido.';
  end if;

  if clean_status = 'banned' then
    effective_ban_until := now() + make_interval(days => greatest(1, coalesce(ban_days, 1)));
  end if;

  update public.app_profiles
  set
    account_status = clean_status,
    disabled_reason = case when clean_status = 'disabled' then clean_reason else null end,
    ban_reason = case when clean_status = 'banned' then clean_reason else null end,
    ban_until = case when clean_status = 'banned' then effective_ban_until else null end,
    updated_at = now()
  where id = target_user_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_update_account_status',
    'app_profiles',
    target_user_id,
    jsonb_build_object(
      'account_status', clean_status,
      'reason', clean_reason,
      'ban_days', ban_days,
      'ban_until', effective_ban_until
    )
  );
end;
$$;

create or replace function public.admin_update_subscription_status(
  target_user_id uuid,
  new_status text,
  provider text default 'mercado_pago',
  reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(new_status));
begin
  if not public.is_primary_owner() then
    raise exception 'Acceso reservado al administrador principal.';
  end if;

  if clean_status not in ('trial', 'active', 'past_due', 'canceled', 'manual') then
    raise exception 'Estatus de suscripcion no valido.';
  end if;

  update public.app_profiles
  set
    subscription_status = clean_status,
    subscription_provider = nullif(trim(coalesce(provider, '')), ''),
    subscription_reference = nullif(trim(coalesce(reference, '')), ''),
    updated_at = now()
  where id = target_user_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_update_subscription_status',
    'app_profiles',
    target_user_id,
    jsonb_build_object(
      'subscription_status', clean_status,
      'provider', provider,
      'reference', reference
    )
  );
end;
$$;

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  message_id uuid not null references public.despacho_chat_mensajes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  matched_category text not null,
  matched_terms text[] not null default '{}',
  excerpt text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'banned')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_flags_status_created
  on public.moderation_flags(status, created_at desc);

create index if not exists idx_moderation_flags_despacho
  on public.moderation_flags(despacho_id, created_at desc);

alter table public.moderation_flags enable row level security;

drop policy if exists "Members can create own moderation flags" on public.moderation_flags;
create policy "Members can create own moderation flags"
  on public.moderation_flags
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_despacho_member(despacho_id)
  );

drop policy if exists "Primary owner can read moderation flags" on public.moderation_flags;
create policy "Primary owner can read moderation flags"
  on public.moderation_flags
  for select
  to authenticated
  using (public.is_primary_owner());

drop policy if exists "Primary owner can update moderation flags" on public.moderation_flags;
create policy "Primary owner can update moderation flags"
  on public.moderation_flags
  for update
  to authenticated
  using (public.is_primary_owner())
  with check (public.is_primary_owner());

create or replace function public.admin_resolve_moderation_flag(
  flag_id uuid,
  resolution text,
  ban_days integer default null,
  admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_flag public.moderation_flags%rowtype;
  clean_resolution text := lower(trim(resolution));
  technical_reason text;
begin
  if not public.is_primary_owner() then
    raise exception 'Acceso reservado al administrador principal.';
  end if;

  if clean_resolution not in ('reviewed', 'dismissed', 'banned') then
    raise exception 'Resolucion de moderacion no valida.';
  end if;

  select * into target_flag
  from public.moderation_flags
  where id = flag_id;

  if target_flag.id is null then
    raise exception 'Alerta no encontrada.';
  end if;

  update public.moderation_flags
  set
    status = clean_resolution,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    admin_notes = nullif(trim(coalesce(admin_notes, '')), '')
  where id = flag_id;

  if clean_resolution = 'banned' then
    technical_reason :=
      'Detectamos posible infraccion a las normas de uso por lenguaje que podria incitar a delitos, odio, discriminacion o violencia. La cuenta queda en revision preventiva.';

    perform public.admin_update_account_status(
      target_flag.user_id,
      'banned',
      technical_reason,
      greatest(1, coalesce(ban_days, 1))
    );
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_resolve_moderation_flag',
    'moderation_flags',
    flag_id,
    jsonb_build_object(
      'resolution', clean_resolution,
      'ban_days', ban_days,
      'matched_category', target_flag.matched_category
    )
  );
end;
$$;

drop policy if exists "Primary owner can read all despachos" on public.despachos;
create policy "Primary owner can read all despachos"
  on public.despachos
  for select
  to authenticated
  using (public.is_primary_owner());

drop policy if exists "Primary owner can read all despacho members" on public.despacho_miembros;
create policy "Primary owner can read all despacho members"
  on public.despacho_miembros
  for select
  to authenticated
  using (public.is_primary_owner());

drop policy if exists "Primary owner can read all chat messages" on public.despacho_chat_mensajes;
create policy "Primary owner can read all chat messages"
  on public.despacho_chat_mensajes
  for select
  to authenticated
  using (public.is_primary_owner());

drop policy if exists "Primary owner can read all chat attachments" on public.despacho_chat_adjuntos;
create policy "Primary owner can read all chat attachments"
  on public.despacho_chat_adjuntos
  for select
  to authenticated
  using (public.is_primary_owner());

grant execute on function public.track_app_usage(integer) to authenticated;
grant execute on function public.admin_update_account_status(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_update_subscription_status(uuid, text, text, text) to authenticated;
grant execute on function public.admin_resolve_moderation_flag(uuid, text, integer, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'moderation_flags'
    )
  then
    alter publication supabase_realtime add table public.moderation_flags;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
