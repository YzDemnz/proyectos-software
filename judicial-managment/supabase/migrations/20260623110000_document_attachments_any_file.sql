alter table public.document_adjuntos
  drop constraint if exists document_adjuntos_file_size_check;

alter table public.document_adjuntos
  add constraint document_adjuntos_file_size_check
  check (file_size > 0 and file_size <= 104857600);

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = null
where id = 'despacho-document-files';

notify pgrst, 'reload schema';
