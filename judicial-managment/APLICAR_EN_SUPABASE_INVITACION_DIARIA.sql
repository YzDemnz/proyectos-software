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
