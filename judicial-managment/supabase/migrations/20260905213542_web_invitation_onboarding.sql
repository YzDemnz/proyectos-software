create function judicial_web_private.join_workspace(invitation_code text,nombre_personal text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid(); target uuid;
begin
  -- Reuse the same auth/MFA/account checks and account lock before any membership write.
  result:=judicial_web_private.ensure_workspace();
  if result->>'state'<>'onboarding' then return result; end if;
  if nombre_personal is null or length(btrim(nombre_personal)) not between 2 and 60 then raise exception 'Tu nombre debe tener entre 2 y 60 caracteres.'; end if;
  if invitation_code is null or length(btrim(invitation_code)) not between 2 and 120 then raise exception 'Escribe el código de invitación.'; end if;
  perform public.join_despacho_by_code(btrim(invitation_code));
  result:=judicial_web_private.ensure_workspace();
  if result->>'state'<>'ready' then raise exception 'No pudimos vincular el despacho de la invitación.'; end if;
  target:=(result->'membership'->>'id')::uuid;
  update public.despacho_miembros set display_name=btrim(nombre_personal),profile_updated_at=now() where id=target and user_id=actor;
  return judicial_web_private.ensure_workspace();
end;
$$;
revoke all on function judicial_web_private.join_workspace(text,text) from public,anon;
grant execute on function judicial_web_private.join_workspace(text,text) to authenticated;
create function public.join_web_workspace(invitation_code text,nombre_personal text)
returns jsonb language sql security invoker set search_path='' as $$ select judicial_web_private.join_workspace(invitation_code,nombre_personal); $$;
revoke all on function public.join_web_workspace(text,text) from public,anon;
grant execute on function public.join_web_workspace(text,text) to authenticated;
