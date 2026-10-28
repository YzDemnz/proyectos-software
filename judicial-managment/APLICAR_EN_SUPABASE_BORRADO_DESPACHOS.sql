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
