import { supabase } from '@/lib/supabase';

export const BOOK_BUCKET = 'lumen-books';
export const MAX_BOOK_BYTES = 20 * 1024 * 1024;
export const BOOK_CATEGORIES = ['Derecho', 'Ciencias Sociales', 'Ciencias Exactas', 'Literatura', 'Salud', 'Tecnología', 'Arte y Cultura', 'Otros'] as const;
export const BOOK_PAGE_SIZE = 12;

export type Book = {
  id: string;
  owner_id: string;
  title: string;
  author: string;
  description: string;
  category: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
export type BookInput = Pick<Book, 'title' | 'author' | 'description' | 'category'>;

export function bookError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  if (/fetch|network/i.test(message)) return 'No se pudo conectar con la biblioteca. Revisa tu conexión e inténtalo de nuevo.';
  if (/relation .* does not exist|schema cache|bucket not found/i.test(message)) return 'El almacenamiento de la biblioteca aún no está configurado.';
  if (/row-level security|permission denied|jwt expired/i.test(message)) return 'No tienes permiso para esta acción. Inicia sesión y completa la verificación de seguridad.';
  return message || 'No se pudo completar la operación. Inténtalo de nuevo.';
}

export async function listBooks(query: string, category: string, page: number) {
  let request = supabase.from('books').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
  // websearch_to_tsquery treats input as text, never as PostgREST filter syntax.
  if (query.trim()) request = request.textSearch('search_document', query.trim(), { type: 'websearch', config: 'spanish' });
  if (category) request = request.eq('category', category);
  const { data, count, error } = await request.range(page * BOOK_PAGE_SIZE, (page + 1) * BOOK_PAGE_SIZE - 1);
  if (error) throw error;
  return { books: (data ?? []) as Book[], count: count ?? 0 };
}

export async function validateBookFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'epub') throw new Error('Selecciona un archivo PDF o EPUB.');
  if (file.size <= 0 || file.size > MAX_BOOK_BYTES) throw new Error('El archivo debe tener contenido y pesar como máximo 20 MiB.');
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const validHeader = extension === 'pdf'
    ? new TextDecoder().decode(header) === '%PDF-'
    : header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  if (!validHeader) throw new Error('El contenido del archivo no corresponde al formato seleccionado.');
  return { extension, mimeType: extension === 'pdf' ? 'application/pdf' : 'application/epub+zip' };
}

export async function uploadBook(input: BookInput, file: File): Promise<Book> {
  const { extension, mimeType } = await validateBookFile(file);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Inicia sesión para subir un libro.');
  const id = crypto.randomUUID();
  const path = `${user.id}/${id}.${extension}`;
  const record = {
    ...input,
    title: input.title.trim(), author: input.author.trim(), description: input.description.trim(),
    id, owner_id: user.id, file_path: path, file_name: file.name.slice(0, 240),
    mime_type: mimeType, size_bytes: file.size,
  };
  const { error: uploadError } = await supabase.storage.from(BOOK_BUCKET).upload(path, file, { contentType: mimeType, upsert: false, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('books').insert(record).select().single();
  if (!error) return data as Book;

  // Storage and Postgres cannot share a transaction. A response may be lost after
  // the insert commits: confirm absence before compensating to avoid broken rows.
  const { data: existing, error: lookupError } = await supabase.from('books').select('*').eq('id', id).maybeSingle();
  if (existing) return existing as Book;
  if (lookupError) throw new Error('La conexión se interrumpió al publicar. Actualiza la biblioteca antes de repetir la subida.');
  const { error: cleanupError } = await supabase.storage.from(BOOK_BUCKET).remove([path]);
  if (cleanupError) throw new Error('No se pudo publicar ni retirar el archivo temporal. Contacta al administrador antes de volver a subirlo.');
  throw error;
}

export async function downloadBook(book: Book) {
  const baseName = book.file_name.replace(/\.(pdf|epub)$/i, '').replace(/[^\p{L}\p{N} _-]/gu, '_').slice(0, 180) || 'libro';
  const safeName = `${baseName}.${book.mime_type === 'application/pdf' ? 'pdf' : 'epub'}`;
  const { data, error } = await supabase.storage.from(BOOK_BUCKET).createSignedUrl(book.file_path, 60, { download: safeName });
  if (error) throw error;
  const link = document.createElement('a');
  link.href = data.signedUrl;
  link.rel = 'noopener noreferrer';
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function deleteBook(book: Book) {
  // Remove the object first so a storage failure keeps the retryable catalogue
  // entry. Repeating remove is safe; no storage SQL deletion is performed.
  const { error: storageError } = await supabase.storage.from(BOOK_BUCKET).remove([book.file_path]);
  if (storageError) throw storageError;
  const { data, error } = await supabase.from('books').delete().eq('id', book.id).eq('owner_id', book.owner_id).select('id');
  if (error) throw new Error('Se retiró el archivo, pero falta quitar su ficha. Vuelve a pulsar Eliminar para completar la operación.');
  if (!data?.length) throw new Error('No se pudo eliminar la ficha. Actualiza la biblioteca y verifica tu sesión.');
}
