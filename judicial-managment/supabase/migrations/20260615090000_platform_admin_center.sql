/*
  # Platform administration center

  Separates platform administration from despacho roles. A platform
  administrator can review operational metadata, subscriptions, support
  reports, moderation alerts and audit events without entering a despacho.

  Bootstrap:
    1. Create or confirm the intended Supabase Auth user.
    2. Insert that user id into public.platform_admins from the SQL editor.

  No email address is hardcoded as an authorization rule.
*/

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  label text not null default 'Administrador principal',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins administrator
    where administrator.user_id = auth.uid()
      and administrator.active = true
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "Platform admins can read their authorization" on public.platform_admins;
create policy "Platform admins can read their authorization"
  on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid() and active = true);

/*
  Keep existing administrative RPCs compatible while removing the fixed-email
  authorization dependency.
*/
create or replace function public.is_primary_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin();
$$;

drop policy if exists "Platform admins can read all profiles" on public.app_profiles;
create policy "Platform admins can read all profiles"
  on public.app_profiles
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can read audit log" on public.audit_log;
create policy "Platform admins can read audit log"
  on public.audit_log
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can read all despachos" on public.despachos;
create policy "Platform admins can read all despachos"
  on public.despachos
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can read all despacho members" on public.despacho_miembros;
create policy "Platform admins can read all despacho members"
  on public.despacho_miembros
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can read moderation flags" on public.moderation_flags;
create policy "Platform admins can read moderation flags"
  on public.moderation_flags
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can update moderation flags" on public.moderation_flags;
create policy "Platform admins can update moderation flags"
  on public.moderation_flags
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  despacho_id uuid references public.despachos(id) on delete set null,
  category text not null default 'otro'
    check (category in ('error', 'sugerencia', 'cuenta', 'seguridad', 'privacidad', 'datos', 'actualizacion', 'otro')),
  title text not null,
  description text not null,
  steps_to_reproduce text not null default '',
  expected_behavior text not null default '',
  contains_sensitive_data boolean not null default false,
  status text not null default 'new'
    check (status in ('new', 'in_review', 'waiting_user', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  app_version text,
  platform text,
  admin_notes text,
  admin_reply text,
  assigned_to uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_reports_status_created
  on public.support_reports(status, created_at desc);

create index if not exists idx_support_reports_user
  on public.support_reports(user_id, created_at desc);

alter table public.support_reports enable row level security;

drop policy if exists "Users can create support reports" on public.support_reports;
create policy "Users can create support reports"
  on public.support_reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can read own support reports" on public.support_reports;
create policy "Users can read own support reports"
  on public.support_reports
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "Platform admins can update support reports" on public.support_reports;
create policy "Platform admins can update support reports"
  on public.support_reports
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create table if not exists public.platform_donations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  donor_email text,
  amount_mxn numeric(12, 2) not null check (amount_mxn > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'refunded')),
  provider text not null default 'mercado_pago',
  external_reference text unique,
  message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_donations_status_created
  on public.platform_donations(status, created_at desc);

alter table public.platform_donations enable row level security;

drop policy if exists "Platform admins can read donations" on public.platform_donations;
create policy "Platform admins can read donations"
  on public.platform_donations
  for select
  to authenticated
  using (public.is_platform_admin());

create table if not exists public.platform_security_alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'application',
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  user_id uuid references auth.users(id) on delete set null,
  despacho_id uuid references public.despachos(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_security_alerts_status_created
  on public.platform_security_alerts(status, created_at desc);

alter table public.platform_security_alerts enable row level security;

drop policy if exists "Platform admins can read security alerts" on public.platform_security_alerts;
create policy "Platform admins can read security alerts"
  on public.platform_security_alerts
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists "Platform admins can update security alerts" on public.platform_security_alerts;
create policy "Platform admins can update security alerts"
  on public.platform_security_alerts
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.admin_update_support_report(
  report_id uuid,
  new_status text,
  new_priority text default null,
  notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(new_status));
  clean_priority text := nullif(lower(trim(coalesce(new_priority, ''))), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso reservado al administrador de plataforma.';
  end if;

  if clean_status not in ('new', 'in_review', 'waiting_user', 'resolved', 'closed') then
    raise exception 'Estado de reporte no valido.';
  end if;

  if clean_priority is not null and clean_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridad no valida.';
  end if;

  update public.support_reports
  set
    status = clean_status,
    priority = coalesce(clean_priority, priority),
    admin_notes = nullif(trim(coalesce(notes, '')), ''),
    assigned_to = auth.uid(),
    reviewed_at = now(),
    resolved_at = case when clean_status in ('resolved', 'closed') then now() else null end,
    updated_at = now()
  where id = report_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_update_support_report',
    'support_reports',
    report_id,
    jsonb_build_object('status', clean_status, 'priority', clean_priority)
  );
end;
$$;

create or replace function public.admin_update_security_alert(
  alert_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(new_status));
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso reservado al administrador de plataforma.';
  end if;

  if clean_status not in ('open', 'investigating', 'resolved', 'dismissed') then
    raise exception 'Estado de alerta no valido.';
  end if;

  update public.platform_security_alerts
  set
    status = clean_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = alert_id;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_update_security_alert',
    'platform_security_alerts',
    alert_id,
    jsonb_build_object('status', clean_status)
  );
end;
$$;

create or replace function public.admin_get_flag_context(flag_id uuid)
returns table (
  message_id uuid,
  sender_user_id uuid,
  body text,
  created_at timestamptz,
  is_flagged_message boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_flag public.moderation_flags%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Acceso reservado al administrador de plataforma.';
  end if;

  select * into target_flag
  from public.moderation_flags
  where id = flag_id;

  if target_flag.id is null then
    raise exception 'Alerta de moderacion no encontrada.';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_view_moderation_context',
    'moderation_flags',
    flag_id,
    jsonb_build_object('despacho_id', target_flag.despacho_id)
  );

  return query
  select
    message.id,
    message.sender_user_id,
    message.body,
    message.created_at,
    message.id = target_flag.message_id
  from public.despacho_chat_mensajes message
  where message.despacho_id = target_flag.despacho_id
    and message.created_at between target_flag.created_at - interval '20 minutes'
      and target_flag.created_at + interval '20 minutes'
  order by message.created_at asc
  limit 40;
end;
$$;

grant execute on function public.admin_update_support_report(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_security_alert(uuid, text) to authenticated;
grant execute on function public.admin_get_flag_context(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists set_platform_admins_updated_at on public.platform_admins;
    create trigger set_platform_admins_updated_at
      before update on public.platform_admins
      for each row execute function public.set_updated_at();

    drop trigger if exists set_support_reports_updated_at on public.support_reports;
    create trigger set_support_reports_updated_at
      before update on public.support_reports
      for each row execute function public.set_updated_at();

    drop trigger if exists set_platform_donations_updated_at on public.platform_donations;
    create trigger set_platform_donations_updated_at
      before update on public.platform_donations
      for each row execute function public.set_updated_at();

    drop trigger if exists set_platform_security_alerts_updated_at on public.platform_security_alerts;
    create trigger set_platform_security_alerts_updated_at
      before update on public.platform_security_alerts
      for each row execute function public.set_updated_at();
  end if;
end $$;

notify pgrst, 'reload schema';
