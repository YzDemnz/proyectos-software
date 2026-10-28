/*
  Grants the authenticated API role access to the administration tables.
  Row Level Security remains the authority that decides which rows and
  operations each authenticated user may use.
*/

grant select on public.platform_admins to authenticated;

grant select, insert on public.support_reports to authenticated;
grant update on public.support_reports to authenticated;

grant select on public.platform_donations to authenticated;

grant select, update on public.platform_security_alerts to authenticated;

grant select on public.audit_log to authenticated;
grant select on public.app_profiles to authenticated;
grant select on public.despachos to authenticated;
grant select on public.despacho_miembros to authenticated;
grant select, update on public.moderation_flags to authenticated;

notify pgrst, 'reload schema';
