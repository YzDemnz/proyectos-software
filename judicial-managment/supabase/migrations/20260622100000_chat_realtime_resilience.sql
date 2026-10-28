do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'despacho_chat_mensajes',
    'despacho_chat_adjuntos',
    'despacho_miembros'
  ]
  loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

alter table public.despacho_chat_mensajes replica identity full;
alter table public.despacho_chat_adjuntos replica identity full;
alter table public.despacho_miembros replica identity full;

notify pgrst, 'reload schema';
