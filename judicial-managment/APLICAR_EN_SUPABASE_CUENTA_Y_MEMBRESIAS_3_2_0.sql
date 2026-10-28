-- Judicial Managment 3.2.0
-- Limpia los despachos duplicados conservando el rol con mayor permiso y
-- habilita telefono/correo alternativo para la propia cuenta.

with ranked_memberships as (
  select id, row_number() over (
    partition by despacho_id, user_id
    order by case role when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 else 1 end desc, created_at asc, id asc
  ) as row_number
  from public.despacho_miembros
)
delete from public.despacho_miembros
where id in (select id from ranked_memberships where row_number > 1);

create unique index if not exists idx_despacho_miembros_one_membership on public.despacho_miembros(despacho_id, user_id);

alter table public.app_profiles add column if not exists telefono text;
alter table public.app_profiles add column if not exists correo_alternativo text;

-- El chat conserva un limite razonable, pero no limita los formatos adjuntos.
update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = null
where id = 'despacho-chat-files';

create or replace function public.update_my_account_contact(telefono_value text default null, correo_alternativo_value text default null)
returns public.app_profiles language plpgsql security definer set search_path = public as $$
declare
  clean_phone text := nullif(trim(coalesce(telefono_value, '')), '');
  clean_alternate_email text := lower(nullif(trim(coalesce(correo_alternativo_value, '')), ''));
  updated_profile public.app_profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesion.'; end if;
  if clean_phone is not null and clean_phone !~ '^[0-9+() .-]{7,24}$' then raise exception 'El telefono no tiene un formato valido.'; end if;
  if clean_alternate_email is not null and clean_alternate_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'El correo alternativo no tiene un formato valido.'; end if;
  update public.app_profiles set telefono = clean_phone, correo_alternativo = clean_alternate_email, updated_at = now()
  where id = auth.uid() returning * into updated_profile;
  if updated_profile.id is null then raise exception 'No se encontro el perfil de la cuenta.'; end if;
  return updated_profile;
end;
$$;
revoke all on function public.update_my_account_contact(text, text) from public;
grant execute on function public.update_my_account_contact(text, text) to authenticated;
notify pgrst, 'reload schema';
