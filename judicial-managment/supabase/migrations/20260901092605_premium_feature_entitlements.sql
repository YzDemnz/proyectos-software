create or replace function public.has_premium_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_profiles
    where id = auth.uid()
      and account_status = 'active'
      and subscription_status in ('active', 'manual')
  );
$$;

revoke all on function public.has_premium_access() from public;
revoke execute on function public.has_premium_access() from anon;
grant execute on function public.has_premium_access() to authenticated, service_role;

drop policy if exists "Despacho members can read Escriba documents" on public.escriba_documentos;
drop policy if exists "Despacho editors can create Escriba documents" on public.escriba_documentos;
drop policy if exists "Despacho editors can update Escriba documents" on public.escriba_documentos;
drop policy if exists "Despacho editors can delete Escriba documents" on public.escriba_documentos;
drop policy if exists "Despacho members can read Escriba versions" on public.escriba_versiones;
drop policy if exists "Despacho editors can create Escriba versions" on public.escriba_versiones;

create policy "Premium despacho members can read Escriba documents"
  on public.escriba_documentos for select to authenticated
  using (public.has_premium_access() and public.is_despacho_member(despacho_id));

create policy "Premium despacho editors can create Escriba documents"
  on public.escriba_documentos for insert to authenticated
  with check (
    public.has_premium_access()
    and public.can_edit_despacho(despacho_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and (
      expediente_id is null
      or exists (
        select 1 from public.expedientes
        where id = expediente_id
          and despacho_id = escriba_documentos.despacho_id
      )
    )
  );

create policy "Premium despacho editors can update Escriba documents"
  on public.escriba_documentos for update to authenticated
  using (public.has_premium_access() and public.can_edit_despacho(despacho_id))
  with check (
    public.has_premium_access()
    and public.can_edit_despacho(despacho_id)
    and updated_by = auth.uid()
    and (
      expediente_id is null
      or exists (
        select 1 from public.expedientes
        where id = expediente_id
          and despacho_id = escriba_documentos.despacho_id
      )
    )
  );

create policy "Premium despacho editors can delete Escriba documents"
  on public.escriba_documentos for delete to authenticated
  using (public.has_premium_access() and public.can_edit_despacho(despacho_id));

create policy "Premium despacho members can read Escriba versions"
  on public.escriba_versiones for select to authenticated
  using (public.has_premium_access() and public.is_despacho_member(despacho_id));

create policy "Premium despacho editors can create Escriba versions"
  on public.escriba_versiones for insert to authenticated
  with check (
    public.has_premium_access()
    and public.can_edit_despacho(despacho_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.escriba_documentos
      where id = documento_id
        and despacho_id = escriba_versiones.despacho_id
    )
  );

drop policy if exists "Despacho members can read Juris preferences" on public.juris_preferencias;
drop policy if exists "Despacho admins can manage Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho members can read Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can manage Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can add Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can update Juris preferences" on public.juris_preferencias;
drop policy if exists "Premium despacho admins can remove Juris preferences" on public.juris_preferencias;
drop policy if exists "Despacho members can read Juris references" on public.juris_referencias;
drop policy if exists "Despacho admins can add Juris references" on public.juris_referencias;
drop policy if exists "Despacho admins can remove Juris references" on public.juris_referencias;

create policy "Premium despacho members can read Juris preferences"
  on public.juris_preferencias for select to authenticated
  using (public.has_premium_access() and public.is_despacho_member(despacho_id));

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

create policy "Premium despacho members can read Juris references"
  on public.juris_referencias for select to authenticated
  using (public.has_premium_access() and public.is_despacho_member(despacho_id));

create policy "Premium despacho admins can add Juris references"
  on public.juris_referencias for insert to authenticated
  with check (
    public.has_premium_access()
    and public.can_admin_despacho(despacho_id)
    and uploaded_by = auth.uid()
  );

create policy "Premium despacho admins can remove Juris references"
  on public.juris_referencias for delete to authenticated
  using (public.has_premium_access() and public.can_admin_despacho(despacho_id));

drop policy if exists "Despacho members can read document files" on storage.objects;
drop policy if exists "Despacho editors can upload document files" on storage.objects;
drop policy if exists "Despacho editors can delete document files" on storage.objects;

create policy "Despacho members can read document files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_despacho_member(((storage.foldername(name))[1])::uuid)
        and (
          coalesce((storage.foldername(name))[2], '') <> 'juris-referencias'
          or public.has_premium_access()
        )
      else false
    end
  );

create policy "Despacho editors can upload document files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_edit_despacho(((storage.foldername(name))[1])::uuid)
        and (
          coalesce((storage.foldername(name))[2], '') <> 'juris-referencias'
          or public.has_premium_access()
        )
      else false
    end
  );

create policy "Despacho editors can delete document files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'despacho-document-files'
    and case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_edit_despacho(((storage.foldername(name))[1])::uuid)
        and (
          coalesce((storage.foldername(name))[2], '') <> 'juris-referencias'
          or public.has_premium_access()
        )
      else false
    end
  );

notify pgrst, 'reload schema';
