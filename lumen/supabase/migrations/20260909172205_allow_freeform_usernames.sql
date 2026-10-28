-- Remove the old ASCII/length format while retaining atomic uniqueness.
alter table public.profiles drop constraint profiles_username_format;
alter table public.profiles add constraint profiles_username_not_blank
  check (username ~ '[^[:space:]]');
alter table public.usernames drop constraint usernames_username_check;
alter table public.usernames add constraint usernames_not_blank
  check (username ~ '[^[:space:]]');

create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce(btrim(p_username) ~ '[^[:space:]]'
    and not exists (select 1 from public.usernames where username = lower(btrim(p_username))), false);
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare chosen_username text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if chosen_username is null or chosen_username !~ '[^[:space:]]' then
    raise exception 'A username is required' using errcode = '23514';
  end if;
  insert into public.profiles (id, email, full_name, username)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100), chosen_username);
  return new;
end;
$$;
