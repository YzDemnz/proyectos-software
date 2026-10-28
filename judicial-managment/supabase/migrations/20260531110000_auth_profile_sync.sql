/*
  # Auth profile sync hardening

  Ensures every Supabase Auth user has an app_profiles row so the admin panel can
  manage newly confirmed users. This also exposes a safe self-heal RPC that a
  logged-in user can call after confirmation or login.
*/

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
select
  auth_user.id,
  auth_user.email,
  case
    when lower(coalesce(auth_user.email, '')) = public.primary_owner_email() then 'owner'
    else 'user'
  end,
  'active',
  'trial',
  'mercado_pago',
  auth_user.created_at,
  auth_user.created_at + interval '30 days'
from auth.users auth_user
on conflict (id) do update
set
  email = excluded.email,
  role = case
    when lower(coalesce(excluded.email, '')) = public.primary_owner_email() then 'owner'
    else public.app_profiles.role
  end,
  account_status = coalesce(public.app_profiles.account_status, 'active'),
  subscription_status = coalesce(public.app_profiles.subscription_status, 'trial'),
  subscription_provider = coalesce(public.app_profiles.subscription_provider, 'mercado_pago'),
  trial_started_at = coalesce(public.app_profiles.trial_started_at, excluded.trial_started_at),
  trial_ends_at = coalesce(public.app_profiles.trial_ends_at, excluded.trial_ends_at),
  updated_at = now();

create or replace function public.ensure_own_app_profile()
returns public.app_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user auth.users%rowtype;
  synced_profile public.app_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into auth_user
  from auth.users
  where id = auth.uid();

  if auth_user.id is null then
    raise exception 'Usuario de autenticacion no encontrado.';
  end if;

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
    auth_user.id,
    auth_user.email,
    case
      when lower(coalesce(auth_user.email, '')) = public.primary_owner_email() then 'owner'
      else 'user'
    end,
    'active',
    'trial',
    'mercado_pago',
    auth_user.created_at,
    auth_user.created_at + interval '30 days'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    role = case
      when lower(coalesce(excluded.email, '')) = public.primary_owner_email() then 'owner'
      else public.app_profiles.role
    end,
    account_status = coalesce(public.app_profiles.account_status, 'active'),
    subscription_status = coalesce(public.app_profiles.subscription_status, 'trial'),
    subscription_provider = coalesce(public.app_profiles.subscription_provider, 'mercado_pago'),
    trial_started_at = coalesce(public.app_profiles.trial_started_at, excluded.trial_started_at),
    trial_ends_at = coalesce(public.app_profiles.trial_ends_at, excluded.trial_ends_at),
    updated_at = now()
  returning * into synced_profile;

  return synced_profile;
end;
$$;

grant execute on function public.ensure_own_app_profile() to authenticated;

notify pgrst, 'reload schema';
