import { extractBrowserDocumentText } from '../web/browserDocuments';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, MessageSquareText, SlidersHorizontal, Sparkles, Trash2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDocumentFileSize, getSupportedDocumentFileType, maxDocumentFileSize } from '../lib/documentAttachments';

type JurisTone = 'formal' | 'claro' | 'directo';

interface JurisReferenceRow {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  extraction_status: 'ready' | 'needs_ocr' | 'unsupported' | 'failed' | 'pending';
  extracted_text?: string;
  document_kind?: string;
  matter?: string;
  keywords?: string[];
  priority?: number;
  is_default?: boolean;
  updated_at?: string;
  created_at: string;
}

interface JurisPersonalizationProps {
  despachoId: string;
  canManage: boolean;
}

const toneOptions: Array<{ value: JurisTone; label: string; description: string }> = [
  { value: 'formal', label: 'Formal juridico', description: 'Estructurado, tecnico y sobrio.' },
  { value: 'claro', label: 'Claro y profesional', description: 'Lenguaje juridico comprensible y ordenado.' },
  { value: 'directo', label: 'Directo y conciso', description: 'Respuestas breves, con pasos claros.' },
];

const safeFileName = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'referencia';
  return extension ? `${baseName}.${extension}` : baseName;
};

const isTextFile = (file: File) => file.type.startsWith('text/') || /\.(txt|md|rtf|html?|csv)$/i.test(file.name);

const inferReferenceMetadata = (fileName: string, extractedText: string) => {
  const normalized = `${fileName} ${extractedText.slice(0, 12_000)}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  const documentKinds = ['apelacion', 'amparo', 'contestacion', 'demanda', 'alegatos', 'promocion', 'incidente', 'recurso', 'queja', 'convenio'];
  const matters = ['mercantil', 'civil', 'familiar', 'penal', 'laboral', 'administrativo', 'amparo'];
  const documentKind = documentKinds.find((candidate) => normalized.includes(candidate)) ?? '';
  const matter = matters.find((candidate) => normalized.includes(candidate)) ?? '';
  const keywords = [...new Set([
    documentKind,
    matter,
    ...normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 6).slice(0, 20),
  ].filter(Boolean))].slice(0, 24);
  return { documentKind, matter, keywords };
};

export default function JurisPersonalization({ despachoId, canManage }: JurisPersonalizationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tone, setTone] = useState<JurisTone>('formal');
  const [instructions, setInstructions] = useState('');
  const [references, setReferences] = useState<JurisReferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const [preferencesResult, initialReferencesResult] = await Promise.all([
      supabase.from('juris_preferencias').select('response_tone,custom_instructions').eq('despacho_id', despachoId).maybeSingle(),
      supabase.from('juris_referencias').select('id,title,file_name,file_type,file_size,extraction_status,extracted_text,document_kind,matter,keywords,priority,is_default,created_at,updated_at').eq('despacho_id', despachoId).order('created_at', { ascending: false }),
    ]);
    let referencesData: unknown[] = initialReferencesResult.data ?? [];
    let referencesError = initialReferencesResult.error;
    if (referencesError?.code === 'PGRST204' || referencesError?.code === '42703') {
      const legacyReferencesResult = await supabase.from('juris_referencias').select('id,title,file_name,file_type,file_size,extraction_status,extracted_text,created_at,updated_at').eq('despacho_id', despachoId).order('created_at', { ascending: false });
      referencesData = legacyReferencesResult.data ?? [];
      referencesError = legacyReferencesResult.error;
    }
    const migrationUnavailable = [preferencesResult.error, referencesError]
      .some((error) => error?.code === 'PGRST205' || error?.code === '42P01');
    if (migrationUnavailable) {
      setMessage('La biblioteca privada de Juris se habilitara al aplicar la actualización de base de datos de esta versión.');
      setLoading(false);
      return;
    }
    const firstError = preferencesResult.error ?? referencesError;
    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }
    const preferences = preferencesResult.data as { response_tone?: JurisTone; custom_instructions?: string } | null;
    setTone(preferences?.response_tone ?? 'formal');
    setInstructions(preferences?.custom_instructions ?? '');
    const nextReferences = referencesData as JurisReferenceRow[];
    setReferences(nextReferences);
    const cacheableReferences = nextReferences
      .filter((reference) => reference.extraction_status === 'ready' && reference.extracted_text?.trim())
      .map((reference) => ({
        id: reference.id,
        title: reference.title,
        fileName: reference.file_name,
        documentKind: reference.document_kind ?? '',
        matter: reference.matter ?? '',
        keywords: Array.isArray(reference.keywords) ? reference.keywords : [],
        priority: reference.priority ?? 100,
        isDefault: reference.is_default === true,
        extractedText: reference.extracted_text ?? '',
        updatedAt: reference.updated_at ?? reference.created_at,
      }));
    await window.judicialDesktop?.replaceJurisReferenceCache?.({
      despachoId,
      references: cacheableReferences,
    }).catch(() => undefined);
    setLoading(false);
  }, [despachoId]);

  useEffect(() => {
    load().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar la configuracion de Juris.');
      setLoading(false);
    });
  }, [load]);

  const savePreferences = async () => {
    if (!canManage || saving) return;
    setSaving(true);
    setMessage('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage('Inicia sesión nuevamente para guardar la personalización.');
      setSaving(false);
      return;
    }
    const { error } = await supabase.from('juris_preferencias').upsert({
      despacho_id: despachoId,
      response_tone: tone,
      custom_instructions: instructions.trim().slice(0, 2000),
      updated_by: user.id,
    }, { onConflict: 'despacho_id' });
    setSaving(false);
    setMessage(error ? error.message : 'Personalizacion de Juris guardada.');
  };

  const uploadReference = async (file?: File) => {
    if (!file || !canManage || uploading) return;
    if (file.size > maxDocumentFileSize) {
      setMessage(`"${file.name}" supera el limite de 100 MB.`);
      return;
    }
    setUploading(true);
    setMessage('Preparando referencia privada...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage('Inicia sesión nuevamente para subir una referencia.');
      setUploading(false);
      return;
    }
    const referenceId = crypto.randomUUID();
    const storagePath = `${despachoId}/juris-referencias/${referenceId}/${safeFileName(file.name)}`;
    const fileType = getSupportedDocumentFileType(file);
    const { error: uploadError } = await supabase.storage.from('despacho-document-files').upload(storagePath, file, { contentType: fileType, upsert: false });
    if (uploadError) {
      setMessage(uploadError.message);
      setUploading(false);
      return;
    }
    try {
      let extractionStatus: JurisReferenceRow['extraction_status'] = 'unsupported';
      let extractedText = '';
      if (isTextFile(file)) {
        extractionStatus = 'ready';
        extractedText = (await file.text()).split(String.fromCharCode(0)).join('').trim().slice(0, 160000);
      } else {
        const { data: signed, error: signedError } = await supabase.storage.from('despacho-document-files').createSignedUrl(storagePath, 10 * 60);
        if (signedError || !signed?.signedUrl) throw signedError ?? new Error('No se pudo abrir el archivo de referencia.');
        const result = await extractBrowserDocumentText({ url: signed.signedUrl, fileName: file.name, fileType });
        extractionStatus = result.status as JurisReferenceRow['extraction_status'];
        extractedText = (result.extractedText ?? '').slice(0, 160000);
      }
      const metadata = inferReferenceMetadata(file.name, extractedText);
      const referencePayload = {
        id: referenceId,
        despacho_id: despachoId,
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        storage_path: storagePath,
        extraction_status: extractionStatus,
        extracted_text: extractedText,
        document_kind: metadata.documentKind,
        matter: metadata.matter,
        keywords: metadata.keywords,
        priority: 100,
        uploaded_by: user.id,
      };
      let { error: insertError } = await supabase.from('juris_referencias').insert(referencePayload);
      if (insertError?.code === 'PGRST204' || insertError?.code === '42703') {
        const legacyPayload = {
          id: referencePayload.id,
          despacho_id: referencePayload.despacho_id,
          title: referencePayload.title,
          file_name: referencePayload.file_name,
          file_type: referencePayload.file_type,
          file_size: referencePayload.file_size,
          storage_path: referencePayload.storage_path,
          extraction_status: referencePayload.extraction_status,
          extracted_text: referencePayload.extracted_text,
          uploaded_by: referencePayload.uploaded_by,
        };
        ({ error: insertError } = await supabase.from('juris_referencias').insert(legacyPayload));
      }
      if (insertError) throw insertError;
      setMessage(extractionStatus === 'ready'
        ? 'Referencia agregada. Juris la priorizara cuando coincida con el escrito solicitado.'
        : 'Referencia guardada. Conviertela a PDF con texto o DOCX para que Juris pueda leerla.');
      await load();
    } catch (error) {
      await supabase.storage.from('despacho-document-files').remove([storagePath]);
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la referencia.');
    } finally {
      setUploading(false);
    }
  };

  const removeReference = async (reference: JurisReferenceRow) => {
    if (!canManage || !window.confirm(`¿Quitar "${reference.file_name}" de las referencias de Juris?`)) return;
    const { data, error } = await supabase.from('juris_referencias').delete().eq('id', reference.id).eq('despacho_id', despachoId).select('storage_path').maybeSingle();
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data?.storage_path) await supabase.storage.from('despacho-document-files').remove([data.storage_path]);
    await window.judicialDesktop?.removeJurisReferenceCache?.({ despachoId, referenceId: reference.id }).catch(() => undefined);
    setReferences((current) => current.filter((item) => item.id !== reference.id));
    setMessage('Referencia eliminada.');
  };

  return (
    <section className="overflow-hidden rounded-md border border-blue-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"><Sparkles className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-950 dark:text-white">Personaliza a Juris</h3><p className="text-xs text-slate-500 dark:text-slate-400">Define su tono y las referencias privadas que usara para preparar borradores.</p></div>
        {!canManage && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">Solo lectura</span>}
      </div>
      <div className="space-y-5 p-5">
        {message && <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-100">{message}</div>}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center gap-2 text-slate-900 dark:text-white"><SlidersHorizontal className="h-4 w-4 text-blue-700 dark:text-blue-300" /><h4 className="text-sm font-semibold">Forma de responder</h4></div><div className="mt-3 grid gap-2">{toneOptions.map((option) => <label key={option.value} className={`cursor-pointer rounded-md border px-3 py-2 transition ${tone === option.value ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}><span className="flex items-start gap-2"><input type="radio" name="juris-tone" value={option.value} checked={tone === option.value} disabled={!canManage || loading} onChange={() => setTone(option.value)} className="mt-1" /><span><span className="block text-sm font-medium text-slate-900 dark:text-white">{option.label}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{option.description}</span></span></span></label>)}</div></div>
          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center gap-2 text-slate-900 dark:text-white"><MessageSquareText className="h-4 w-4 text-blue-700 dark:text-blue-300" /><h4 className="text-sm font-semibold">Instrucciones del despacho</h4></div><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Indica el tono, la forma de nombrar escritos o qué datos debe pedir antes de redactar.</p><textarea value={instructions} disabled={!canManage || loading} onChange={(event) => setInstructions(event.target.value.slice(0, 2000))} rows={7} maxLength={2000} placeholder="Ejemplo: antes de redactar, pregunta por la autoridad y la fecha de notificación si no están en el expediente." className="mt-3 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800" /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{instructions.length}/2000</span><button type="button" disabled={!canManage || saving || loading} onClick={() => savePreferences().catch(() => undefined)} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Guardando...' : 'Guardar estilo'}</button></div></div>
        </div>
        <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" /><div><h4 className="text-sm font-semibold text-slate-900 dark:text-white">Formatos y referencias privadas</h4><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">Sube formatos propios, ejemplos sanitizados o guías internas. Juris toma primero el más cercano al escrito solicitado y nunca mezcla datos de otros despachos.</p></div></div><input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { uploadReference(event.target.files?.[0]).catch(() => undefined); event.target.value = ''; }} /><button type="button" disabled={!canManage || uploading || loading} onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:bg-slate-950 dark:text-blue-200">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? 'Subiendo...' : 'Añadir referencia'}</button></div><div className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">{loading ? <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando referencias...</div> : references.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">Aún no hay referencias propias. Puedes seguir usando la biblioteca jurídica incluida o añadir los formatos del despacho.</p> : references.map((reference) => <div key={reference.id} className="flex items-center gap-3 px-4 py-3"><FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{reference.title}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{reference.file_name} · {formatDocumentFileSize(reference.file_size)} · {reference.extraction_status === 'ready' ? 'Listo para Juris' : reference.extraction_status === 'needs_ocr' ? 'Requiere OCR' : 'No legible todavía'}</p></div>{canManage && <button type="button" title="Eliminar referencia" onClick={() => removeReference(reference).catch(() => undefined)} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>}</div>)}</div></div>
      </div>
    </section>
  );
}
