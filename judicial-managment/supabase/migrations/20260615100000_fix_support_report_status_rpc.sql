/*
  Uses the status vocabulary already established by support_reports.
*/

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

grant execute on function public.admin_update_support_report(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
