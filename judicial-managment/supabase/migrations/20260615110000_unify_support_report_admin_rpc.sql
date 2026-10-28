/*
  Removes the temporary four-argument overload and keeps one unambiguous
  administration RPC compatible with the existing support workflow.
*/

drop function if exists public.admin_update_support_report(uuid, text, text, text);

create or replace function public.admin_update_support_report(
  report_id uuid,
  new_status text,
  new_priority text default null,
  reply text default null,
  notes text default null
)
returns public.support_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(new_status));
  clean_priority text := nullif(lower(trim(coalesce(new_priority, ''))), '');
  updated_report public.support_reports%rowtype;
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
    admin_reply = nullif(left(trim(coalesce(reply, '')), 8000), ''),
    admin_notes = nullif(left(trim(coalesce(notes, '')), 8000), ''),
    assigned_to = auth.uid(),
    reviewed_at = now(),
    resolved_at = case when clean_status in ('resolved', 'closed') then now() else null end,
    updated_at = now()
  where id = report_id
  returning * into updated_report;

  if updated_report.id is null then
    raise exception 'Reporte no encontrado.';
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_update_support_report',
    'support_reports',
    report_id,
    jsonb_build_object('status', clean_status, 'priority', clean_priority)
  );

  return updated_report;
end;
$$;

grant execute on function public.admin_update_support_report(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
