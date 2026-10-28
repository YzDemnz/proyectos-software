-- Activa sincronizacion en tiempo real para los datos compartidos del despacho.
-- Es idempotente: puede ejecutarse mas de una vez sin duplicar tablas en la publicacion.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'app_profiles',
    'despachos',
    'despacho_miembros',
    'despacho_invitaciones',
    'expedientes',
    'movimientos',
    'clientes',
    'cliente_movimientos',
    'calendario_eventos',
    'laboral_asuntos',
    'document_adjuntos',
    'despacho_chat_mensajes',
    'despacho_chat_adjuntos',
    'support_reports',
    'moderation_flags',
    'escriba_documentos',
    'escriba_versiones',
    'juris_preferencias',
    'juris_referencias'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    if exists (
      select 1
      from pg_publication
      where pubname = 'supabase_realtime'
    ) and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;

    execute format(
      'alter table public.%I replica identity full',
      target_table
    );
  end loop;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';

