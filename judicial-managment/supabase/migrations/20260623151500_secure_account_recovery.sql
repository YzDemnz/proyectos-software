-- Version 3.2.1: verified backup recovery and a phone-only update endpoint.
-- The backup email is never trusted until its one-time token is confirmed.

create extension if not exists pgcrypto;

alter table public.app_profiles add column if not exists telefono text;
alter table public.app_profiles add column if not exists correo_alternativo text;
alter table public.app_profiles add column if not exists correo_alternativo_verificado_en timestamptz;
alter table public.app_profiles add column if not exists recovery_email_enabled boolean not null default false;

create table if not exists public.account_recovery_email_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_email text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'revoked')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_recovery_email_challenges_user_pending_idx
  on public.account_recovery_email_challenges(user_id, status, expires_at desc);

create index if not exists app_profiles_verified_recovery_email_idx
  on public.app_profiles(correo_alternativo)
  where recovery_email_enabled = true and correo_alternativo_verificado_en is not null;

alter table public.account_recovery_email_challenges enable row level security;

create table if not exists public.account_recovery_email_request_limits (
  identifier_hash text primary key,
  last_requested_at timestamptz not null default now()
);

alter table public.account_recovery_email_request_limits enable row level security;

create or replace function public.update_my_account_phone(telefono_value text default null)
returns public.app_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_phone text := nullif(trim(coalesce(telefono_value, '')), '');
  updated_profile public.app_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  if clean_phone is not null and clean_phone !~ '^[0-9+() .-]{7,24}$' then
    raise exception 'El telefono no tiene un formato valido.';
  end if;

  update public.app_profiles
  set telefono = clean_phone, updated_at = now()
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'No se encontro el perfil de la cuenta.';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.create_recovery_email_challenge(
  backup_email_value text,
  token_hash_value text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_email text := lower(nullif(trim(coalesce(backup_email_value, '')), ''));
  challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  if not exists (
    select 1
    from auth.mfa_factors
    where user_id = auth.uid() and status = 'verified'
  ) then
    raise exception 'Activa la verificacion en 2 pasos antes de agregar un correo de respaldo.';
  end if;

  if clean_email is null or clean_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'El correo de respaldo no tiene un formato valido.';
  end if;

  if exists (
    select 1
    from auth.users
    where id = auth.uid()
      and lower(email) = clean_email
  ) then
    raise exception 'El correo de respaldo debe ser diferente al correo principal.';
  end if;

  if length(token_hash_value) <> 64 or token_hash_value !~ '^[a-f0-9]+$' then
    raise exception 'El token de verificacion no es valido.';
  end if;

  update public.account_recovery_email_challenges
  set status = 'revoked'
  where user_id = auth.uid() and status = 'pending';

  insert into public.account_recovery_email_challenges (
    user_id, backup_email, token_hash, expires_at
  ) values (
    auth.uid(), clean_email, token_hash_value, now() + interval '30 minutes'
  ) returning id into challenge_id;

  return challenge_id;
end;
$$;

create or replace function public.confirm_recovery_email_challenge(raw_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  confirmed_challenge public.account_recovery_email_challenges%rowtype;
begin
  if raw_token is null or length(raw_token) < 32 then
    return false;
  end if;

  update public.account_recovery_email_challenges
  set status = 'verified', verified_at = now()
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now()
  returning * into confirmed_challenge;

  if confirmed_challenge.id is null then
    return false;
  end if;

  update public.app_profiles
  set
    correo_alternativo = confirmed_challenge.backup_email,
    correo_alternativo_verificado_en = now(),
    recovery_email_enabled = true,
    updated_at = now()
  where id = confirmed_challenge.user_id;

  return true;
end;
$$;

revoke all on function public.update_my_account_phone(text) from public;
grant execute on function public.update_my_account_phone(text) to authenticated;
revoke all on function public.create_recovery_email_challenge(text, text) from public;
grant execute on function public.create_recovery_email_challenge(text, text) to authenticated;
revoke all on function public.confirm_recovery_email_challenge(text) from public;
grant execute on function public.confirm_recovery_email_challenge(text) to anon, authenticated;

notify pgrst, 'reload schema';
