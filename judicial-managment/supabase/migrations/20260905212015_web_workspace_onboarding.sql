-- Web has one immutable workspace binding per account. Desktop memberships remain unchanged.
create schema if not exists judicial_web_private;
revoke all on schema judicial_web_private from public, anon;
grant usage on schema judicial_web_private to authenticated, service_role;

create table public.web_account_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  despacho_id uuid references public.despachos(id) on delete set null,
  created_at timestamptz not null default now()
);
create index web_account_workspaces_despacho_idx on public.web_account_workspaces(despacho_id);
alter table public.web_account_workspaces enable row level security;
revoke all on public.web_account_workspaces from public, anon, authenticated;
grant select on public.web_account_workspaces to authenticated;
grant all on public.web_account_workspaces to service_role;
create policy "Read own web workspace" on public.web_account_workspaces
for select to authenticated using (user_id = (select auth.uid()));

create function judicial_web_private.ensure_workspace(despacho_nombre text default null, nombre_personal text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target uuid;
  has_binding boolean;
  result jsonb;
  clean_office text := btrim(despacho_nombre);
  clean_name text := btrim(nombre_personal);
  actor_email text;
begin
  if actor is null then raise exception 'Inicia sesión para continuar.' using errcode = '42501'; end if;
  -- Serialize initialization for this account, including simultaneous tabs/retries.
  perform 1 from auth.users where id = actor for update;
  if not found then raise exception 'La cuenta no existe.' using errcode = '42501'; end if;
  if exists(select 1 from public.app_profiles where id = actor and
    (account_status = 'disabled' or (account_status = 'banned' and (ban_until is null or ban_until > now()))))
  then raise exception 'Esta cuenta no tiene acceso activo.' using errcode = '42501'; end if;
  if exists(select 1 from auth.mfa_factors where user_id=actor and status='verified')
    and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2'
  then raise exception 'Completa la verificación en dos pasos.' using errcode = '42501'; end if;

  select despacho_id into target from public.web_account_workspaces where user_id = actor;
  has_binding := found;
  if not has_binding then
    select m.despacho_id into target from public.despacho_miembros m
      join public.despachos d on d.id = m.despacho_id
      where m.user_id = actor and d.deleted_at is null
      order by (m.role = 'owner') desc, d.created_at, d.id limit 1;
    if target is null then
      if exists(select 1 from public.despachos where owner_user_id=actor and deleted_at is not null) then
        return jsonb_build_object('state','unavailable','message','Tu despacho está en la papelera. Recupéralo desde la aplicación de escritorio antes de continuar.');
      end if;
      if despacho_nombre is null and nombre_personal is null then return jsonb_build_object('state','onboarding'); end if;
      if clean_office is null or length(clean_office) not between 2 and 120 then raise exception 'El nombre del despacho debe tener entre 2 y 120 caracteres.'; end if;
      if clean_name is null or length(clean_name) not between 2 and 60 then raise exception 'Tu nombre debe tener entre 2 y 60 caracteres.'; end if;
      select email into actor_email from auth.users where id=actor;
      -- Both names, ownership and binding commit together, or none do.
      insert into public.despachos(nombre,owner_user_id) values(clean_office,actor) returning id into target;
      insert into public.despacho_miembros(despacho_id,user_id,email,role,display_name,profile_updated_at)
      values(target,actor,coalesce(actor_email,''),'owner',clean_name,now());
    end if;
    insert into public.web_account_workspaces(user_id,despacho_id) values(actor,target);
  end if;
  select to_jsonb(m) || jsonb_build_object('despacho',to_jsonb(d)) into result
    from public.despacho_miembros m join public.despachos d on d.id=m.despacho_id
    where m.user_id=actor and m.despacho_id=target and d.deleted_at is null;
  if result is null then
    return jsonb_build_object('state','unavailable','message','Tu despacho web ya no está disponible o tu acceso fue retirado. Contacta al propietario o revisa su estado desde escritorio.');
  end if;
  return jsonb_build_object('state','ready','membership',result);
end;
$$;
revoke all on function judicial_web_private.ensure_workspace(text,text) from public, anon;
grant execute on function judicial_web_private.ensure_workspace(text,text) to authenticated;

create function public.ensure_web_workspace(despacho_nombre text default null,nombre_personal text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select judicial_web_private.ensure_workspace(despacho_nombre,nombre_personal);
$$;
revoke all on function public.ensure_web_workspace(text,text) from public, anon;
grant execute on function public.ensure_web_workspace(text,text) to authenticated;
