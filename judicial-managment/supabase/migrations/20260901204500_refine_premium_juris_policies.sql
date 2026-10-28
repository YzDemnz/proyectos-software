drop policy if exists "Premium despacho admins can manage Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can add Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can update Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can remove Juris preferences" on public.juris_preferencias;

create policy "Premium despacho admins can add Juris preferences"
  on public.juris_preferencias for insert to authenticated
  with check (
    public.has_premium_access()
    and public.can_admin_despacho(despacho_id)
    and updated_by = auth.uid()
  );

create policy "Premium despacho admins can update Juris preferences"
  on public.juris_preferencias for update to authenticated
  using (public.has_premium_access() and public.can_admin_despacho(despacho_id))
  with check (
    public.has_premium_access()
    and public.can_admin_despacho(despacho_id)
    and updated_by = auth.uid()
  );

create policy "Premium despacho admins can remove Juris preferences"
  on public.juris_preferencias for delete to authenticated
  using (public.has_premium_access() and public.can_admin_despacho(despacho_id));

notify pgrst, 'reload schema';
