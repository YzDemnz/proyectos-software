import { FormEvent, useEffect, useRef, useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { BOOK_CATEGORIES, bookError, uploadBook } from '@/lib/books';
import './books.css';

type Props = { open: boolean; onClose: () => void; onUploaded: () => void };

export function BookUpload({ open, onClose, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(BOOK_CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, [open]);
  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!file) { setError('Selecciona un libro PDF o EPUB.'); return; }
    if (!title.trim() || !author.trim()) { setError('Escribe el título y el autor.'); return; }
    setBusy(true);
    try {
      await uploadBook({ title, author, description, category }, file);
      setTitle(''); setAuthor(''); setDescription(''); setFile(null);
      onUploaded();
      onClose();
    } catch (err) { setError(bookError(err)); }
    finally { setBusy(false); }
  };

  return <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <div className="book-upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title" aria-busy={busy} ref={dialogRef} tabIndex={-1} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
        if (!elements?.length) { event.preventDefault(); return; }
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <button className="book-modal-close" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={20} /></button>
      <p className="eyebrow">COMPARTE CONOCIMIENTO</p><h2 id="upload-title">Subir un libro</h2><p className="book-upload-intro">PDF o EPUB · Máximo 20 MiB por libro</p>
      <form onSubmit={(event) => void submit(event)}><fieldset disabled={busy}>
        <label htmlFor="book-title">Título<input id="book-title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label htmlFor="book-author">Autor<input id="book-author" required maxLength={160} value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
        <label htmlFor="book-category">Categoría<select id="book-category" value={category} onChange={(event) => setCategory(event.target.value)}>{BOOK_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label htmlFor="book-description">Descripción (opcional)<textarea id="book-description" rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label htmlFor="book-file">Archivo<input id="book-file" type="file" required accept=".pdf,.epub,application/pdf,application/epub+zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <p className="book-upload-note">Comparte libros propios, de dominio público o que tengas permiso de distribuir.</p>
        {error && <p className="book-alert" role="alert">{error}</p>}
        <button className="primary-button book-submit" type="submit"><CloudUpload size={18} />{busy ? 'Subiendo y guardando…' : 'Publicar libro'}</button>
      </fieldset></form>
      {busy && <p className="book-upload-note" role="status">Mantén esta ventana abierta hasta terminar.</p>}
    </div>
  </div>;
}
