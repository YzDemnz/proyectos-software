import { useEffect, useState } from 'react';
import { BookOpen, CloudUpload, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Book, BOOK_PAGE_SIZE, bookError, deleteBook, downloadBook, listBooks } from '@/lib/books';
import './books.css';

type Props = { query: string; category: string; refreshKey: number; onUpload: () => void; onSignIn: () => void; onClear: () => void };

export function BookCatalog({ query, category, refreshKey, onUpload, onSignIn, onClear }: Props) {
  const { user, mfaPending } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => { setPage(0); }, [query, category, refreshKey]);
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    listBooks(query, category, page).then((result) => {
      if (!ignore) { setBooks(result.books); setCount(result.count); }
    }).catch((err: unknown) => { if (!ignore) setError(bookError(err)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [query, category, page, refreshKey, reload]);

  const runAction = async (book: Book, remove: boolean) => {
    if (!user || mfaPending) { onSignIn(); return; }
    setBusyId(book.id);
    setActionError('');
    try {
      if (remove) {
        await deleteBook(book);
        setConfirmId('');
        if (books.length === 1 && page > 0) setPage(page - 1);
        else setReload((value) => value + 1);
      } else await downloadBook(book);
    } catch (err) { setActionError(bookError(err)); }
    finally { setBusyId(''); }
  };

  return <section className="book-library" id="biblioteca" aria-labelledby="catalog-title">
    <div className="book-catalog-heading">
      <div><p className="eyebrow">BIBLIOTECA</p><h2 id="catalog-title">{query ? `Resultados para “${query}”` : category || 'Explora la biblioteca'}</h2>
        {!loading && !error && <p>{count} {count === 1 ? 'libro disponible' : 'libros disponibles'}{query && category ? ` · ${category}` : ''}</p>}</div>
      <div className="book-toolbar">
        {(query || category) && <button className="text-link" onClick={onClear}>Quitar filtros</button>}
        <button className="primary-button" onClick={onUpload}><CloudUpload size={16} /> Subir libro</button>
      </div>
    </div>
    {actionError && <p className="book-alert" role="alert">{actionError}</p>}
    {loading ? <div className="book-status" role="status">Cargando libros…</div> : error ? <div className="book-status"><p role="alert">{error}</p><button className="secondary-button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> Reintentar</button></div> : books.length === 0 ?
      <div className="book-status"><BookOpen size={32} /><h3>{query || category ? 'No encontramos libros con estos filtros' : 'Tu biblioteca empieza aquí'}</h3><p>{query || category ? 'Prueba otra búsqueda o explora todas las categorías.' : 'Sube el primer libro para que otros lectores lo descubran.'}</p></div> :
      <div className="book-grid">{books.map((book) => <article className="book-card" key={book.id}>
        <div className="book-cover"><BookOpen size={38} strokeWidth={1.3} /><span>{book.mime_type === 'application/pdf' ? 'PDF' : 'EPUB'}</span></div>
        <div className="book-card-body"><p className="eyebrow">{book.category}</p><h3>{book.title}</h3><p className="book-author">{book.author}</p><p className="book-description">{book.description || 'Sin descripción.'}</p><p className="book-file-size">{(book.size_bytes / (1024 * 1024)).toFixed(2)} MiB</p>
          <div className="book-card-actions"><button className="primary-button" disabled={!!busyId} onClick={() => void runAction(book, false)}><Download size={15} />{busyId === book.id ? 'Procesando…' : user && !mfaPending ? 'Descargar' : 'Entrar para descargar'}</button>
            {user?.id === book.owner_id && !mfaPending && <button className="book-delete" aria-label={`Eliminar ${book.title}`} disabled={!!busyId} onClick={() => setConfirmId(confirmId === book.id ? '' : book.id)}><Trash2 size={16} /></button>}</div>
          {confirmId === book.id && <div className="book-delete-confirm"><p>Se eliminará este libro de la biblioteca.</p><button className="book-delete" disabled={!!busyId} onClick={() => void runAction(book, true)}>Eliminar definitivamente</button><button className="text-link" disabled={!!busyId} onClick={() => setConfirmId('')}>Cancelar</button></div>}
        </div>
      </article>)}</div>}
    {!loading && !error && count > BOOK_PAGE_SIZE && <div className="book-pagination"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1} de {Math.ceil(count / BOOK_PAGE_SIZE)}</span><button className="secondary-button" disabled={(page + 1) * BOOK_PAGE_SIZE >= count} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
  </section>;
}
