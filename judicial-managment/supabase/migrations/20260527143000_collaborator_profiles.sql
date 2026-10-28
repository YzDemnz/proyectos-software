alter table public.despacho_miembros
  add column if not exists display_name text,
  add column if not exists profile_color text not null default '#1D4ED8',
  add column if not exists avatar_url text,
  add column if not exists profile_updated_at timestamptz;

update public.despacho_miembros
set profile_color = '#1D4ED8'
where profile_color is null or profile_color = '';

do $$
begin
  alter table public.despacho_miembros
    add constraint despacho_miembros_profile_color_check
    check (profile_color ~ '^#[0-9A-Fa-f]{6}$');
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile avatars are public" on storage.objects;
drop policy if exists "Authenticated users can upload profile avatars" on storage.objects;
drop policy if exists "Authenticated users can update profile avatars" on storage.objects;

create policy "Profile avatars are public"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

create policy "Authenticated users can upload profile avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-avatars');

create policy "Authenticated users can update profile avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-avatars')
  with check (bucket_id = 'profile-avatars');

create or replace function public.update_my_despacho_profile(
  target_member_id uuid,
  profile_display_name text,
  profile_color_value text,
  profile_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.despacho_miembros%rowtype;
  clean_display_name text := nullif(trim(profile_display_name), '');
  clean_profile_color text := upper(coalesce(nullif(trim(profile_color_value), ''), '#1D4ED8'));
  clean_avatar_url text := nullif(trim(profile_avatar_url), '');
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesion.';
  end if;

  select * into target_member
  from public.despacho_miembros
  where id = target_member_id
  for update;

  if target_member.id is null then
    raise exception 'Colaborador no encontrado.';
  end if;

  if target_member.user_id <> auth.uid() then
    raise exception 'Solo puedes editar tu propio perfil visible.';
  end if;

  if clean_display_name is not null and length(clean_display_name) > 60 then
    raise exception 'El nombre visible debe tener 60 caracteres o menos.';
  end if;

  if clean_profile_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Color invalido.';
  end if;

  update public.despacho_miembros
  set
    display_name = clean_display_name,
    profile_color = clean_profile_color,
    avatar_url = clean_avatar_url,
    profile_updated_at = now()
  where id = target_member_id;
end;
$$;

grant execute on function public.update_my_despacho_profile(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
