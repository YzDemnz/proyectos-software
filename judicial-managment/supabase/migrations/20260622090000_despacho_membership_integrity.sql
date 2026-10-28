/*
  Keeps a single membership per user and despacho.
  Older partial installations may have duplicate rows despite the original constraint.
*/

with ranked_memberships as (
  select
    id,
    row_number() over (
      partition by despacho_id, user_id
      order by
        case role
          when 'owner' then 1
          when 'admin' then 2
          when 'editor' then 3
          else 4
        end,
        created_at asc,
        id asc
    ) as row_number
  from public.despacho_miembros
)
delete from public.despacho_miembros
where id in (
  select id
  from ranked_memberships
  where row_number > 1
);

create unique index if not exists idx_despacho_miembros_one_membership
  on public.despacho_miembros(despacho_id, user_id);

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

grant execute on function public.join_despacho_by_code(text) to authenticated;
notify pgrst, 'reload schema';
