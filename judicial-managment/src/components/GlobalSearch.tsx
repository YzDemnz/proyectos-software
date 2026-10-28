import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Briefcase, FileCheck, FileText, Loader2, Search, Settings, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type GlobalSearchSection = 'dashboard' | 'expedientes' | 'movimientos' | 'calendario' | 'escriba' | 'clientes' | 'tribunal' | 'configuracion';

interface GlobalSearchProps {
  despachoId: string;
  inputRef: RefObject<HTMLInputElement>;
  includeEscriba: boolean;
  variant: 'windows' | 'mac';
  onNavigate: (section: GlobalSearchSection) => void;
}

interface SearchResult {
  id: string;
  section: GlobalSearchSection;
  kind: 'Expediente' | 'Cliente' | 'Movimiento' | 'Módulo';
  title: string;
  detail: string;
}

const MODULES: Array<{ section: GlobalSearchSection; title: string; detail: string }> = [
  { section: 'dashboard', title: 'Panel de Control', detail: 'Resumen del despacho' },
  { section: 'expedientes', title: 'Expedientes', detail: 'Directorio y documentos' },
  { section: 'movimientos', title: 'Movimientos', detail: 'Actuaciones y archivos' },
  { section: 'calendario', title: 'Calendario', detail: 'Audiencias y citas' },
  { section: 'escriba', title: 'Escriba', detail: 'Editor jurídico Premium' },
  { section: 'clientes', title: 'Clientes', detail: 'Contactos y adeudos' },
  { section: 'tribunal', title: 'Laboral', detail: 'Asuntos laborales' },
  { section: 'configuracion', title: 'Configuración', detail: 'Cuenta, equipo y seguridad' },
];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX')
  .trim();

const sanitizeFilterValue = (value: string) => value
  .replace(/[%_,().'"\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 80);

const resultIcon = (kind: SearchResult['kind']) => {
  if (kind === 'Expediente') return FileText;
  if (kind === 'Cliente') return UserRound;
  if (kind === 'Movimiento') return FileCheck;
  return Settings;
};

export default function GlobalSearch({ despachoId, inputRef, includeEscriba, variant, onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const moduleResults = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return [];

    return MODULES
      .filter((module) => includeEscriba || module.section !== 'escriba')
      .filter((module) => normalize(`${module.title} ${module.detail}`).includes(normalizedQuery))
      .map<SearchResult>((module) => ({
        id: `module-${module.section}`,
        section: module.section,
        kind: 'Módulo',
        title: module.title,
        detail: module.detail,
      }))
      .slice(0, 3);
  }, [includeEscriba, query]);

  const results = useMemo(() => [...moduleResults, ...remoteResults].slice(0, 12), [moduleResults, remoteResults]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    const searchValue = sanitizeFilterValue(query);
    if (!searchValue || !despachoId) {
      setRemoteResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const pattern = `%${searchValue}%`;
      const [expedientesResult, clientesResult, movimientosResult] = await Promise.all([
        supabase
          .from('expedientes')
          .select('id,numero_expediente,partes,juzgado,estatus')
          .eq('despacho_id', despachoId)
          .or(`numero_expediente.ilike.${pattern},partes.ilike.${pattern},juzgado.ilike.${pattern}`)
          .limit(5),
        supabase
          .from('clientes')
          .select('id,nombre,total_adeudo')
          .eq('despacho_id', despachoId)
          .ilike('nombre', pattern)
          .limit(5),
        supabase
          .from('movimientos')
          .select('id,tipo,descripcion,fecha')
          .eq('despacho_id', despachoId)
          .or(`tipo.ilike.${pattern},descripcion.ilike.${pattern}`)
          .limit(5),
      ]);

      if (!active) return;
      const nextResults: SearchResult[] = [
        ...((expedientesResult.data ?? []).map((item) => ({
          id: `expediente-${item.id}`,
          section: 'expedientes' as const,
          kind: 'Expediente' as const,
          title: item.numero_expediente,
          detail: [item.partes, item.juzgado, item.estatus].filter(Boolean).join(' · '),
        }))),
        ...((clientesResult.data ?? []).map((item) => ({
          id: `cliente-${item.id}`,
          section: 'clientes' as const,
          kind: 'Cliente' as const,
          title: item.nombre,
          detail: Number(item.total_adeudo) > 0
            ? `Adeudo: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(item.total_adeudo))}`
            : 'Sin adeudo registrado',
        }))),
        ...((movimientosResult.data ?? []).map((item) => ({
          id: `movimiento-${item.id}`,
          section: 'movimientos' as const,
          kind: 'Movimiento' as const,
          title: item.tipo,
          detail: [item.descripcion, item.fecha].filter(Boolean).join(' · '),
        }))),
      ];
      setRemoteResults(nextResults);
      setLoading(false);
      setActiveIndex(0);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [despachoId, query]);

  const selectResult = (result: SearchResult) => {
    onNavigate(result.section);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex] ?? results[0]);
      event.currentTarget.blur();
    }
  };

  return (
    <div ref={rootRef} className={`global-search global-search-${variant} ${variant === 'mac' ? 'mac-toolbar-search' : 'windows-v3-search'}`}>
      <div className="global-search-input">
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar expedientes, clientes, movimientos..."
          aria-label="Buscar en el despacho"
          role="combobox"
          aria-expanded={open && Boolean(query)}
          aria-controls="global-search-results"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />}
        {!loading && query && (
          <button type="button" onClick={() => { setQuery(''); setRemoteResults([]); inputRef.current?.focus(); }} title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div id="global-search-results" className="global-search-results" role="listbox">
          {results.length ? results.map((result, index) => {
            const Icon = resultIcon(result.kind);
            return (
              <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'is-active' : ''} onPointerMove={() => setActiveIndex(index)} onClick={() => selectResult(result)}>
                <span className="global-search-result-icon"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">{result.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{result.kind} · {result.detail}</span>
                </span>
              </button>
            );
          }) : !loading && (
            <div className="global-search-empty">
              <Briefcase className="h-5 w-5" />
              <span>No se encontraron coincidencias en este despacho.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
