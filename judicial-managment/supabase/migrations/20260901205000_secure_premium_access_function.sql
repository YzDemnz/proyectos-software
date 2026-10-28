revoke all on function public.has_premium_access() from public;
revoke execute on function public.has_premium_access() from anon;
grant execute on function public.has_premium_access() to authenticated, service_role;

notify pgrst, 'reload schema';
