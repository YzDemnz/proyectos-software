import { importBrowserDocument, importBrowserDocumentFromUrl, exportBrowserDocument, printBrowserDocument } from '../web/browserDocuments';
import { cloudAIFetch } from '../web/cloudAI';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node, type JSONContent } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import DOMPurify from 'dompurify';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Bot,
  Braces,
  ChevronDown,
  Columns3,
  Download,
  FileClock,
  FileDown,
  FilePlus2,
  FileText,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Printer,
  Quote,
  Redo2,
  Save,
  Search,
  Sparkles,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { supabase, type Expediente } from '../lib/supabase';
import {
  createEscribaDocument,
  createEscribaVersion,
  defaultEscribaMargins,
  deleteEscribaDocument,
  listEscribaDocuments,
  listEscribaVersions,
  updateEscribaDocument,
  type EscribaDocument,
  type EscribaMargins,
  type EscribaOrientation,
  type EscribaPageSize,
  type EscribaStatus,
  type EscribaVersion,
} from '../lib/escriba';
import {
  JURIS_AI_CUSTOM_MODEL_KEY,
  JURIS_AI_DEFAULT_MODEL,
  JURIS_AI_ENDPOINT,
  JURIS_AI_MODELS,
  isJurisAIEnabled,
  normalizeJurisAIProfileId,
} from '../lib/jurisAI';
import { executeJurisReadTool } from '../lib/jurisTools';

interface EscribaProps {
  despachoId: string;
  despachoName: string;
  canEdit: boolean;
  importRequest?: EscribaImportRequest | null;
  onImportRequestHandled?: (requestId: string) => void;
}

export interface EscribaImportRequest {
  id: string;
  url: string;
  fileName: string;
  expedienteId?: string | null;
}

type AIDestination = 'replace' | 'insert' | 'selection';

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  parseHTML: () => [{ tag: 'div[data-type="page-break"]' }],
  renderHTML: () => ['div', { 'data-type': 'page-break', class: 'page-break' }],
});

const templates: Record<string, { title: string; html: string }> = {
  blank: {
    title: 'Documento sin titulo',
    html: '<p></p>',
  },
  promotion: {
    title: 'Promocion',
    html: [
      '<p style="text-align: right"><strong>[EXPEDIENTE]</strong></p>',
      '<p style="text-align: right">[ASUNTO]</p>',
      '<p><strong>C. JUEZ [JUZGADO]</strong></p>',
      '<p>[NOMBRE], con la personalidad reconocida en autos, comparezco y expongo:</p>',
      '<p>[CONTENIDO DE LA PROMOCION]</p>',
      '<p>Por lo expuesto, a Usted C. Juez atentamente solicito:</p>',
      '<p><strong>UNICO.</strong> Tenerme por presentado en los terminos de este escrito.</p>',
      '<p style="text-align: center">PROTESTO LO NECESARIO</p>',
      '<p style="text-align: center">[LUGAR Y FECHA]</p>',
      '<p style="text-align: center"><strong>[NOMBRE Y FIRMA]</strong></p>',
    ].join(''),
  },
  appeal: {
    title: 'Recurso de apelacion',
    html: [
      '<p style="text-align: right"><strong>EXPEDIENTE: [NUMERO]</strong></p>',
      '<p><strong>C. JUEZ [JUZGADO]</strong></p>',
      '<p>[PROMOVENTE], por mi propio derecho y con la personalidad reconocida, comparezco para exponer:</p>',
      '<h2>INTERPOSICION DEL RECURSO</h2>',
      '<p>Dentro del plazo legal, interpongo recurso de apelacion contra [RESOLUCION IMPUGNADA], notificada el [FECHA].</p>',
      '<h2>AGRAVIOS</h2>',
      '<p><strong>PRIMERO.</strong> [DESARROLLO DEL AGRAVIO]</p>',
      '<h2>PUNTOS PETITORIOS</h2>',
      '<p><strong>PRIMERO.</strong> Tener por interpuesto el recurso.</p>',
      '<p><strong>SEGUNDO.</strong> Remitir las constancias a la autoridad competente.</p>',
      '<p style="text-align: center">PROTESTO LO NECESARIO</p>',
    ].join(''),
  },
  notes: {
    title: 'Notas de audiencia',
    html: [
      '<h1>Notas de audiencia</h1>',
      '<table><tbody>',
      '<tr><th>Expediente</th><td>[NUMERO]</td></tr>',
      '<tr><th>Fecha y hora</th><td>[FECHA]</td></tr>',
      '<tr><th>Autoridad</th><td>[AUTORIDAD]</td></tr>',
      '<tr><th>Comparecientes</th><td>[COMPARECIENTES]</td></tr>',
      '</tbody></table>',
      '<h2>Desarrollo</h2><p></p>',
      '<h2>Acuerdos y pendientes</h2><ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"><span></span></label><div><p>[PENDIENTE]</p></div></li></ul>',
    ].join(''),
  },
};

const pagePixels: Record<EscribaPageSize, { width: number; height: number }> = {
  letter: { width: 816, height: 1056 },
  a4: { width: 794, height: 1123 },
  legal: { width: 816, height: 1344 },
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const stripCodeFence = (value: string) => value
  .replace(/^```(?:html)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

const sanitizeDocumentText = (value: string) => DOMPurify.sanitize(value, {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
});

const cleanAIHtml = (value: string) => {
  const sanitized = DOMPurify.sanitize(stripCodeFence(value), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload'],
  });
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  [...container.children].forEach((element) => {
    if (element.textContent?.trim().toLocaleLowerCase('es-MX') === 'p') element.remove();
  });
  return container.innerHTML.trim();
};

const shouldIncludeLegalSources = (prompt: string) => {
  const normalized = prompt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  return /(fundament|articulo|ley|codigo|agravio|apelacion|amparo|recurso|competencia|procedencia|plazo|jurisprudencia)/.test(normalized);
};

const inferRequestedDraftType = (prompt: string, documentTitle: string) => {
  const normalized = `${prompt} ${documentTitle}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  const knownTypes = ['apelacion', 'amparo', 'contestacion', 'demanda', 'alegatos', 'promocion', 'incidente', 'recurso', 'queja'];
  return knownTypes.find((type) => normalized.includes(type)) ?? '';
};

const isFullDraftRequest = (prompt: string, documentTitle: string) => {
  const normalized = `${prompt} ${documentTitle}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  return /(redacta|prepara|elabora|crea|genera|haz)/.test(normalized)
    && /(escrito|apelacion|amparo|contestacion|demanda|alegatos|promocion|incidente|recurso|queja)/.test(normalized);
};

const getSelectedDraftingReference = (result: unknown) => {
  if (!result || typeof result !== 'object') return null;
  const toolResult = result as {
    ok?: boolean;
    data?: {
      selectedDraftingReference?: {
        title?: string;
        source?: 'private' | 'platform';
        structure?: string[];
      } | null;
    };
  };
  return toolResult.ok && toolResult.data?.selectedDraftingReference?.title
    ? toolResult.data.selectedDraftingReference
    : null;
};

const validateGeneratedDraft = (
  html: string,
  reference: { title?: string; structure?: string[] } | null,
) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  const normalizedText = (container.textContent ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  if (!normalizedText.trim()) return 'El modelo devolvio un documento vacio.';
  if (/escritura inicial de demandas|\bprologo\b/.test(normalizedText)) {
    return 'El modelo genero una plantilla generica prohibida.';
  }

  const headings = (reference?.structure ?? [])
    .map((heading) => heading
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX')
      .trim())
    .filter((heading) => heading.length >= 3)
    .slice(0, 8);
  if (headings.length >= 2) {
    const matchedHeadings = headings.filter((heading) => normalizedText.includes(heading)).length;
    if (matchedHeadings < Math.min(2, headings.length)) {
      return 'El resultado no respeto suficientes apartados del formato seleccionado.';
    }
  }
  return null;
};

const separateJurisContext = (result: unknown, includeLegalSources: boolean) => {
  if (!result || typeof result !== 'object') return result;
  const toolResult = result as {
    ok?: boolean;
    summary?: string;
    data?: {
      expediente?: unknown;
      processStage?: unknown;
      legalSources?: unknown[];
      draftingExamples?: unknown[];
      selectedDraftingReference?: unknown;
      jurisPersonalization?: unknown;
      referenceHierarchy?: unknown;
      draftingRules?: unknown[];
    };
  };
  if (!toolResult.data) return result;

  return {
    ok: toolResult.ok,
    summary: toolResult.summary,
    hechos_y_evidencia: {
      expediente: toolResult.data.expediente,
      etapa_procesal: toolResult.data.processStage,
    },
    fundamentos_normativos: includeLegalSources ? toolResult.data.legalSources ?? [] : [],
    ejemplos_de_escritos: toolResult.data.draftingExamples ?? [],
    formato_seleccionado: toolResult.data.selectedDraftingReference ?? null,
    jerarquia_de_referencias: toolResult.data.referenceHierarchy ?? null,
    preferencias_del_despacho: toolResult.data.jurisPersonalization ?? null,
    reglas_de_redaccion: toolResult.data.draftingRules ?? [],
  };
};

const buildVerifiedAntecedents = (result: unknown, prompt: string) => {
  const normalizedPrompt = prompt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  if (!/(antecedente|hechos del expediente|datos del expediente)/.test(normalizedPrompt)) return null;
  if (!result || typeof result !== 'object') return null;

  const toolResult = result as {
    ok?: boolean;
    data?: {
      expediente?: {
        numero_expediente?: string;
        partes?: string;
        juzgado?: string;
        materia?: string;
        tipo_juicio?: string;
        estatus?: string;
      };
      processStage?: {
        evidence?: Array<{ source?: string; label?: string; date?: string | null; excerpt?: string }>;
        documents?: Array<{ status?: string; excerpt?: string }>;
      };
    };
  };
  const expediente = toolResult.data?.expediente;
  if (!toolResult.ok || !expediente) return null;

  const evidence = toolResult.data?.processStage?.evidence ?? [];
  const documents = toolResult.data?.processStage?.documents ?? [];
  const hasProceduralEvidence = evidence.some((item) => item.source === 'movimiento' || item.source === 'documento')
    || documents.some((item) => item.status === 'ready' && item.excerpt?.trim());
  if (hasProceduralEvidence) return null;

  const parts = expediente.partes?.split(/\s+vs\.?\s+/i) ?? [];
  const partyText = parts.length === 2
    ? `Las partes registradas son <strong>${sanitizeDocumentText(parts[0])}</strong> y <strong>${sanitizeDocumentText(parts[1])}</strong>.`
    : `Las partes registradas son <strong>${sanitizeDocumentText(expediente.partes ?? '[DATO PENDIENTE]')}</strong>.`;

  return [
    '<h2>Antecedentes</h2>',
    `<p>El expediente <strong>${sanitizeDocumentText(expediente.numero_expediente ?? '[DATO PENDIENTE]')}</strong> se encuentra registrado como <strong>${sanitizeDocumentText(expediente.tipo_juicio ?? '[TIPO DE JUICIO PENDIENTE]')}</strong>, en materia <strong>${sanitizeDocumentText(expediente.materia ?? '[MATERIA PENDIENTE]')}</strong>, ante <strong>${sanitizeDocumentText(expediente.juzgado ?? '[JUZGADO PENDIENTE]')}</strong>.</p>`,
    `<p>${partyText}</p>`,
    `<p>El sistema muestra el expediente con estatus <strong>${sanitizeDocumentText(expediente.estatus ?? '[ESTATUS PENDIENTE]')}</strong>.</p>`,
    '<p>[DATO PENDIENTE] Incorporar la cronología de actuaciones, fechas de notificación, resoluciones y documentos relevantes una vez que consten en el expediente digital.</p>',
  ].join('');
};

const ToolbarButton = ({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={onClick}
    className={`h-8 w-8 shrink-0 grid place-items-center rounded border transition-colors ${
      active
        ? 'border-blue-300 bg-blue-100 text-blue-800'
        : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-white'
    } disabled:cursor-not-allowed disabled:opacity-35`}
  >
    {children}
  </button>
);

function EditorToolbar({
  editor,
  canEdit,
  onImage,
}: {
  editor: Editor;
  canEdit: boolean;
  onImage: () => void;
}) {
  const disabled = !canEdit;
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Dirección del enlace', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex min-h-12 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-3 py-2">
      <ToolbarButton title="Deshacer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Rehacer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-6 w-px bg-slate-300" />

      <select
        title="Estilo de parrafo"
        disabled={disabled}
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1'
            : editor.isActive('heading', { level: 2 }) ? 'h2'
              : editor.isActive('heading', { level: 3 }) ? 'h3'
                : 'p'
        }
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'p') editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
        }}
        className="h-8 w-32 rounded border border-slate-300 bg-white px-2 text-xs"
      >
        <option value="p">Normal</option>
        <option value="h1">Titulo 1</option>
        <option value="h2">Titulo 2</option>
        <option value="h3">Titulo 3</option>
      </select>
      <select
        title="Tipo de letra"
        disabled={disabled}
        value={editor.getAttributes('textStyle').fontFamily ?? ''}
        onChange={(event) => {
          if (event.target.value) editor.chain().focus().setFontFamily(event.target.value).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="h-8 w-32 rounded border border-slate-300 bg-white px-2 text-xs"
      >
        <option value="">Predeterminada</option>
        <option value="Arial">Arial</option>
        <option value="Calibri">Calibri</option>
        <option value="Georgia">Georgia</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Verdana">Verdana</option>
      </select>
      <select
        title="Tamano de letra"
        disabled={disabled}
        value={editor.getAttributes('textStyle').fontSize ?? '12pt'}
        onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()}
        className="h-8 w-20 rounded border border-slate-300 bg-white px-2 text-xs"
      >
        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map((size) => (
          <option key={size} value={`${size}pt`}>{size}</option>
        ))}
      </select>
      <span className="mx-1 h-6 w-px bg-slate-300" />

      <ToolbarButton title="Negrita" active={editor.isActive('bold')} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Cursiva" active={editor.isActive('italic')} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Subrayado" active={editor.isActive('underline')} disabled={disabled} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Tachado" active={editor.isActive('strike')} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Subindice" active={editor.isActive('subscript')} disabled={disabled} onClick={() => editor.chain().focus().toggleSubscript().run()}>
        <SubscriptIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Superindice" active={editor.isActive('superscript')} disabled={disabled} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
        <SuperscriptIcon className="h-4 w-4" />
      </ToolbarButton>
      <label className="relative h-8 w-8 shrink-0 cursor-pointer rounded border border-transparent hover:border-slate-300 hover:bg-white" title="Color de texto">
        <span className="absolute inset-x-2 bottom-1 h-1 rounded bg-blue-700" />
        <span className="absolute inset-0 grid place-items-center text-sm font-bold">A</span>
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={disabled}
          value={editor.getAttributes('textStyle').color ?? '#1e293b'}
          onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
        />
      </label>
      <label className="relative h-8 w-8 shrink-0 cursor-pointer rounded border border-transparent hover:border-slate-300 hover:bg-white" title="Resaltado">
        <span className="absolute inset-x-1 bottom-1 h-2 rounded bg-yellow-300" />
        <span className="absolute inset-0 grid place-items-center"><Highlighter className="h-4 w-4" /></span>
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={disabled}
          value="#fde047"
          onChange={(event) => editor.chain().focus().setBackgroundColor(event.target.value).run()}
        />
      </label>
      <span className="mx-1 h-6 w-px bg-slate-300" />

      <ToolbarButton title="Alinear a la izquierda" active={editor.isActive({ textAlign: 'left' })} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Centrar" active={editor.isActive({ textAlign: 'center' })} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Alinear a la derecha" active={editor.isActive({ textAlign: 'right' })} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Justificar" active={editor.isActive({ textAlign: 'justify' })} disabled={disabled} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Lista con vinetas" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Lista numerada" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Lista de tareas" active={editor.isActive('taskList')} disabled={disabled} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Cita" active={editor.isActive('blockquote')} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-6 w-px bg-slate-300" />

      <ToolbarButton title="Insertar enlace" active={editor.isActive('link')} disabled={disabled} onClick={setLink}>
        <Link2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Insertar imagen" disabled={disabled} onClick={onImage}>
        <ImagePlus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Insertar tabla" disabled={disabled} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Agregar columna" disabled={disabled || !editor.isActive('table')} onClick={() => editor.chain().focus().addColumnAfter().run()}>
        <Columns3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Agregar fila" disabled={disabled || !editor.isActive('table')} onClick={() => editor.chain().focus().addRowAfter().run()}>
        <MoreHorizontal className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Eliminar tabla" disabled={disabled || !editor.isActive('table')} onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Linea horizontal" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Salto de pagina" disabled={disabled} onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}>
        <FileDown className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export default function Escriba({ despachoId, despachoName, canEdit, importRequest, onImportRequestHandled }: EscribaProps) {
  const [documents, setDocuments] = useState<EscribaDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState<EscribaDocument | null>(null);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [versions, setVersions] = useState<EscribaVersion[]>([]);
  const [title, setTitle] = useState('Documento sin titulo');
  const [expedienteId, setExpedienteId] = useState('');
  const [pageSize, setPageSize] = useState<EscribaPageSize>('letter');
  const [orientation, setOrientation] = useState<EscribaOrientation>('portrait');
  const [margins, setMargins] = useState<EscribaMargins>(defaultEscribaMargins);
  const [zoom, setZoom] = useState(0.8);
  const [status, setStatus] = useState<EscribaStatus>('draft');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [changeCounter, setChangeCounter] = useState(0);
  const [documentListOpen, setDocumentListOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDestination, setAiDestination] = useState<AIDestination>('insert');
  const [aiWorking, setAiWorking] = useState(false);
  const [templateId, setTemplateId] = useState('blank');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const loadingDocumentRef = useRef(false);
  const initialLoadRef = useRef(false);
  const handledImportRequestRef = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TextStyleKit,
      Image.configure({ allowBase64: true, inline: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: true } }),
      Subscript,
      Superscript,
      Placeholder.configure({ placeholder: 'Empieza a redactar...' }),
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      PageBreak,
    ],
    content: '<p></p>',
    editable: canEdit,
    editorProps: {
      attributes: {
        class: 'escriba-editor-content focus:outline-none',
        spellcheck: 'true',
      },
    },
    onUpdate: () => {
      if (loadingDocumentRef.current) return;
      setDirty(true);
      setChangeCounter((value) => value + 1);
    },
  });

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  const loadVersions = useCallback(async (documentId: string) => {
    try {
      setVersions(await listEscribaVersions(documentId));
    } catch {
      setVersions([]);
    }
  }, []);

  const selectDocument = useCallback((document: EscribaDocument) => {
    if (!editor) return;
    loadingDocumentRef.current = true;
    setActiveDocument(document);
    setTitle(document.titulo);
    setExpedienteId(document.expediente_id ?? '');
    setPageSize(document.page_size);
    setOrientation(document.orientation);
    setMargins({ ...defaultEscribaMargins, ...(document.margins ?? {}) });
    setStatus(document.status);
    editor.commands.setContent(document.content_json ?? document.content_html ?? '<p></p>', { emitUpdate: false });
    setDirty(false);
    setMessage('');
    loadVersions(document.id).catch(() => undefined);
    window.setTimeout(() => {
      loadingDocumentRef.current = false;
    }, 0);
  }, [editor, loadVersions]);

  const refreshDocuments = useCallback(async (preferredId?: string) => {
    const nextDocuments = await listEscribaDocuments(despachoId);
    setDocuments(nextDocuments);
    const selected = nextDocuments.find((document) => document.id === preferredId)
      ?? nextDocuments.find((document) => document.id === activeDocument?.id)
      ?? nextDocuments[0];
    if (selected) selectDocument(selected);
    return nextDocuments;
  }, [activeDocument?.id, despachoId, selectDocument]);

  useEffect(() => {
    if (!editor) return;
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    Promise.all([
      listEscribaDocuments(despachoId),
      supabase
        .from('expedientes')
        .select('id,numero_expediente,partes,juzgado,materia,tipo_juicio,estatus,cliente_id,created_at,updated_at')
        .eq('despacho_id', despachoId)
        .order('updated_at', { ascending: false }),
    ]).then(async ([nextDocuments, expedienteResult]) => {
      setExpedientes((expedienteResult.data ?? []) as Expediente[]);
      setDocuments(nextDocuments);
      if (nextDocuments[0]) {
        selectDocument(nextDocuments[0]);
      } else if (canEdit) {
        const created = await createEscribaDocument({ despachoId });
        setDocuments([created]);
        selectDocument(created);
      }
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir Escriba.');
    });
  }, [canEdit, despachoId, editor, selectDocument]);

  const currentDocumentPayload = useCallback(() => {
    if (!editor) return null;
    return {
      title: title.trim() || 'Documento sin titulo',
      html: editor.getHTML(),
      text: editor.getText({ blockSeparator: '\n' }),
      pageSize,
      orientation,
      margins,
    };
  }, [editor, margins, orientation, pageSize, title]);

  const saveDocument = useCallback(async ({
    createVersion = false,
    versionLabel = 'Guardado manual',
  } = {}) => {
    if (!editor || !activeDocument || !canEdit || saving) return null;
    setSaving(true);
    try {
      const updated = await updateEscribaDocument(activeDocument.id, {
        titulo: title.trim() || 'Documento sin titulo',
        expediente_id: expedienteId || null,
        content_json: editor.getJSON() as JSONContent,
        content_html: editor.getHTML(),
        plain_text: editor.getText({ blockSeparator: '\n' }),
        page_size: pageSize,
        orientation,
        margins,
        status,
      });
      setActiveDocument(updated);
      setDocuments((current) => [
        updated,
        ...current.filter((document) => document.id !== updated.id),
      ]);
      if (createVersion) {
        await createEscribaVersion({ document: updated, label: versionLabel });
        await loadVersions(updated.id);
      }
      setDirty(false);
      setMessage(createVersion ? 'Documento guardado y versión creada.' : 'Cambios guardados.');
      return updated;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el documento.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    activeDocument,
    canEdit,
    editor,
    expedienteId,
    loadVersions,
    margins,
    orientation,
    pageSize,
    saving,
    status,
    title,
  ]);

  useEffect(() => {
    if (!dirty || !canEdit || !activeDocument) return;
    const timer = window.setTimeout(() => {
      saveDocument().catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [activeDocument, canEdit, changeCounter, dirty, expedienteId, margins, orientation, pageSize, saveDocument, status, title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDocument({ createVersion: true }).catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveDocument]);

  const createFromTemplate = async () => {
    if (!canEdit) return;
    const template = templates[templateId] ?? templates.blank;
    const created = await createEscribaDocument({
      despachoId,
      title: template.title,
      expedienteId: expedienteId || null,
      contentHtml: template.html,
    });
    setDocuments((current) => [created, ...current]);
    selectDocument(created);
    loadingDocumentRef.current = true;
    editor?.commands.setContent(template.html, { emitUpdate: false });
    loadingDocumentRef.current = false;
    if (editor) {
      const saved = await updateEscribaDocument(created.id, {
        content_json: editor.getJSON() as JSONContent,
        content_html: editor.getHTML(),
        plain_text: editor.getText({ blockSeparator: '\n' }),
      });
      setActiveDocument(saved);
      setDocuments((current) => current.map((item) => item.id === saved.id ? saved : item));
    }
  };

  const saveImportedDocument = useCallback(async (result: EscribaFileResult, targetExpedienteId?: string | null) => {
    if (!editor) return false;
    if (!result.ok || !result.html) {
      if (!result.canceled) setMessage(result.error ?? 'No se pudo importar el documento.');
      return false;
    }

    const cleanHtml = DOMPurify.sanitize(result.html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onclick', 'onload'],
    });
    const created = await createEscribaDocument({
      despachoId,
      title: result.title ?? 'Documento importado',
      expedienteId: (targetExpedienteId ?? expedienteId) || null,
      contentHtml: cleanHtml,
    });
    loadingDocumentRef.current = true;
    editor.commands.setContent(cleanHtml, { emitUpdate: false });
    loadingDocumentRef.current = false;
    const saved = await updateEscribaDocument(created.id, {
      content_json: editor.getJSON() as JSONContent,
      content_html: editor.getHTML(),
      plain_text: editor.getText({ blockSeparator: '\n' }),
    });
    setDocuments((current) => [saved, ...current]);
    selectDocument(saved);
    if (targetExpedienteId) setExpedienteId(targetExpedienteId);
    setMessage(result.warnings?.length
      ? `Documento importado. ${result.warnings.join(' ')}`
      : 'Documento importado correctamente.');
    return true;
  }, [despachoId, editor, expedienteId, selectDocument]);

  const importDocument = async () => {
    if (!canEdit || !editor) {
      setMessage('Necesitas permisos de edición para importar un documento.');
      return;
    }
    const result = await importBrowserDocument();
    await saveImportedDocument(result, expedienteId || null);
  };

  useEffect(() => {
    if (!importRequest || !editor || handledImportRequestRef.current === importRequest.id) return;
    handledImportRequestRef.current = importRequest.id;

    const importFromAttachment = async () => {
      if (!canEdit) {
        setMessage('Necesitas permisos de edición para abrir este adjunto en Escriba.');
        onImportRequestHandled?.(importRequest.id);
        return;
      }

      setMessage(`Abriendo ${importRequest.fileName} en Escriba...`);
      const result = await importBrowserDocumentFromUrl({
        url: importRequest.url,
        fileName: importRequest.fileName,
      });
      await saveImportedDocument(result, importRequest.expedienteId ?? null);
      onImportRequestHandled?.(importRequest.id);
    };

    importFromAttachment().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el adjunto en Escriba.');
      onImportRequestHandled?.(importRequest.id);
    });
  }, [canEdit, editor, importRequest, onImportRequestHandled, saveImportedDocument]);

  const exportDocument = async (format: EscribaDocumentPayload['format']) => {
    const payload = currentDocumentPayload();
    if (!payload) {
      setMessage('Abre un documento para exportarlo.');
      return;
    }
    const result = await exportBrowserDocument({ ...payload, format });
    if (!result.ok && !result.canceled) setMessage(result.error ?? 'No se pudo exportar.');
    if (result.ok) setMessage(`Documento exportado: ${result.filePath}`);
  };

  const printDocument = async () => {
    const payload = currentDocumentPayload();
    if (!payload) return;
    const result = await printBrowserDocument(payload);
    if (!result.ok) setMessage(result.error ?? 'No se pudo imprimir.');
  };

  const insertImage = (file: File) => {
    if (!editor || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage('La imagen debe pesar 8 MB o menos.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: String(reader.result), alt: file.name }).run();
    };
    reader.readAsDataURL(file);
  };

  const runAI = async () => {
    if (!editor || !aiPrompt.trim() || aiWorking) return;
    if (!isJurisAIEnabled()) {
      setMessage('Activa Juris IA para usar redaccion asistida en Escriba.');
      return;
    }

    setAiWorking(true);
    setMessage('');
    try {
      const selectedExpediente = expedientes.find((item) => item.id === expedienteId);
      const requestedDraftType = inferRequestedDraftType(aiPrompt, title);
      const asksFullDraft = isFullDraftRequest(aiPrompt, title);
      let legalContext: unknown = null;
      let rawLegalContext: unknown = null;
      if (selectedExpediente) {
        rawLegalContext = await executeJurisReadTool(
          'preparar_contexto_escrito',
          {
            expediente_referencia: selectedExpediente.numero_expediente,
            tipo_escrito: requestedDraftType || title || 'escrito juridico',
            tema: aiPrompt,
          },
          { despachoId, despachoName, canEdit },
        );
        legalContext = separateJurisContext(rawLegalContext, shouldIncludeLegalSources(aiPrompt));
      }

      if (asksFullDraft && !selectedExpediente) {
        setMessage('Vincula el documento a un expediente antes de pedir un escrito completo.');
        return;
      }
      const selectedDraftingReference = getSelectedDraftingReference(rawLegalContext);
      if (asksFullDraft && !selectedDraftingReference) {
        setMessage('Juris no redacto porque no encontro un formato de referencia que coincida. Sube uno en Configuracion > Personaliza a Juris o precisa el tipo de escrito.');
        return;
      }

      const { from, to } = editor.state.selection;
      const selectedText = from === to ? '' : editor.state.doc.textBetween(from, to, '\n');
      const verifiedAntecedents = buildVerifiedAntecedents(rawLegalContext, aiPrompt);
      if (verifiedAntecedents) {
        if (aiDestination === 'replace') {
          editor.commands.setContent(verifiedAntecedents);
        } else if (aiDestination === 'selection' && from !== to) {
          editor.chain().focus().insertContentAt({ from, to }, verifiedAntecedents).run();
        } else {
          editor.chain().focus().insertContent(verifiedAntecedents).run();
        }
        setAiPrompt('');
        setMessage('Escriba genero los antecedentes solo con datos verificados. Los datos faltantes quedaron marcados.');
        return;
      }

      const customModelName = window.localStorage.getItem(JURIS_AI_CUSTOM_MODEL_KEY)?.trim();
      const profileId = normalizeJurisAIProfileId(window.localStorage.getItem('jm-juris-ai-model'));
      const model = JURIS_AI_MODELS.find((item) => item.id === profileId) ?? JURIS_AI_DEFAULT_MODEL;
      const ollamaMessages = [
        {
          role: 'system',
          content: [
            'Eres el asistente de redaccion de Escriba dentro de Judicial Managment.',
            'Devuelve exclusivamente HTML semantico compatible con un procesador de textos.',
            'Usa p, h1, h2, h3, strong, em, u, ul, ol, li, blockquote y table cuando corresponda.',
            'No uses Markdown, bloques de codigo, scripts, estilos externos ni explicaciones fuera del documento.',
            'No inventes hechos, fechas, autoridades, articulos o datos del expediente.',
            'Marca la informacion faltante como [DATO PENDIENTE].',
            'Los hechos y antecedentes solo pueden salir de hechos_y_evidencia. Nunca conviertas una ley, reforma o articulo en hecho del expediente.',
            'fundamentos_normativos sirve exclusivamente para la argumentacion juridica y solo debe usarse cuando no este vacio.',
            'JERARQUIA OBLIGATORIA: formato privado del despacho > hechos y documentos verificados del expediente > biblioteca general supletoria de Judicial.',
            'Si formato_seleccionado.source es private, ese formato manda sobre cualquier ejemplo de platform. Los ejemplos de platform solo pueden completar vacios estructurales no contradictorios.',
            'No copies datos, nombres, expedientes, domicilios, fechas ni hechos de los ejemplos de referencia.',
            'REGLA OBLIGATORIA: para un escrito completo debes recibir formato_seleccionado. Sigue exactamente sus apartados y orden; si es null, devuelve solo un aviso corto solicitando formato.',
            'Nunca titules un documento como "Escritura Inicial de Demandas" ni uses prologos genericos. El titulo y las secciones deben corresponder al formato seleccionado.',
            'Si hay preferencias_del_despacho, respeta su tono e instrucciones siempre que no contradigan los datos verificados.',
            'Si la instruccion solicita una seccion concreta, devuelve solamente esa seccion, sin introducciones como "aqui tienes" o "basandome en".',
            'Si hay contexto juridico, cita solo las fuentes recuperadas y conserva el caracter de borrador sujeto a revision profesional.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruccion: aiPrompt,
            titulo: title,
            destino: aiDestination,
            texto_seleccionado: selectedText || null,
            contenido_actual: editor.getText({ blockSeparator: '\n' }).slice(0, 18_000),
            contexto_expediente_y_leyes: legalContext,
          }),
        },
      ];

      let cleanHtml = '';
      let validationError: string | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await cloudAIFetch(`${JURIS_AI_ENDPOINT}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: customModelName || model.model,
            stream: false,
            keep_alive: '30m',
            options: { temperature: 0.1, seed: 42 },
            messages: ollamaMessages,
          }),
        });
        if (!response.ok) throw new Error('Juris IA no respondio.');
        const result = await response.json() as { message?: { content?: string } };
        cleanHtml = cleanAIHtml(result.message?.content ?? '');
        validationError = cleanHtml
          ? validateGeneratedDraft(cleanHtml, asksFullDraft ? selectedDraftingReference : null)
          : 'Juris no genero contenido util.';
        if (!validationError) break;
        ollamaMessages.push({
          role: 'system',
          content: `La validacion rechazo el resultado: ${validationError} Reintenta una sola vez siguiendo literalmente formato_seleccionado y sin agregar secciones genericas.`,
        });
      }
      if (validationError) throw new Error(`Juris detuvo un borrador que no respetaba la referencia. ${validationError}`);

      if (aiDestination === 'replace') {
        editor.commands.setContent(cleanHtml);
      } else if (aiDestination === 'selection' && from !== to) {
        editor.chain().focus().insertContentAt({ from, to }, cleanHtml).run();
      } else {
        editor.chain().focus().insertContent(cleanHtml).run();
      }
      setAiPrompt('');
      setMessage('Juris agrego el contenido. Revisalo antes de guardar o exportar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el documento.');
    } finally {
      setAiWorking(false);
    }
  };

  const removeDocument = async () => {
    if (!activeDocument || !canEdit) return;
    if (!window.confirm(`Eliminar "${activeDocument.titulo}"? Esta acción no se puede deshacer.`)) return;
    await deleteEscribaDocument(activeDocument.id);
    setActiveDocument(null);
    setVersions([]);
    const remaining = await refreshDocuments();
    if (remaining.length === 0) {
      const created = await createEscribaDocument({ despachoId });
      setDocuments([created]);
      selectDocument(created);
    }
  };

  const restoreVersion = async (version: EscribaVersion) => {
    if (!editor || !canEdit || !activeDocument) return;
    if (!window.confirm(`Restaurar la versión ${version.version_number}?`)) return;
    loadingDocumentRef.current = true;
    editor.commands.setContent(version.content_json, { emitUpdate: false });
    loadingDocumentRef.current = false;
    setDirty(true);
    setChangeCounter((value) => value + 1);
    await saveDocument({ createVersion: true, versionLabel: `Restaurada desde versión ${version.version_number}` });
  };

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-MX');
    return documents.filter((document) => !query || [
      document.titulo,
      expedientes.find((item) => item.id === document.expediente_id)?.numero_expediente ?? '',
    ].join(' ').toLocaleLowerCase('es-MX').includes(query));
  }, [documents, expedientes, search]);

  const dimensions = pagePixels[pageSize];
  const pageStyle = {
    width: orientation === 'portrait' ? dimensions.width : dimensions.height,
    minHeight: orientation === 'portrait' ? dimensions.height : dimensions.width,
    paddingTop: `${margins.top * 3.7795}px`,
    paddingRight: `${margins.right * 3.7795}px`,
    paddingBottom: `${margins.bottom * 3.7795}px`,
    paddingLeft: `${margins.left * 3.7795}px`,
  };
  const editorGridClass = documentListOpen
    ? 'grid-cols-[200px_minmax(0,1fr)_320px]'
    : 'grid-cols-[minmax(0,1fr)_320px]';

  if (!editor) return null;

  return (
    <section className="escriba-shell -mx-4 -my-8 sm:-mx-6 lg:-mx-8">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) insertImage(file);
          event.target.value = '';
        }}
      />

      <header className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-blue-700 text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-950">Escriba</h2>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Editor juridico</span>
              </div>
              <p className="truncate text-xs text-slate-500">
                {saving ? 'Guardando...' : dirty ? 'Cambios pendientes' : 'Guardado'} · {editor.storage.characterCount.words()} palabras
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setFileMenuOpen((current) => !current)}
                className={`flex h-9 items-center gap-2 rounded border px-3 text-sm font-semibold transition ${fileMenuOpen ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                Archivo
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {fileMenuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Documento</p>
                  <label className="block px-2 pb-2 text-xs font-medium text-slate-600">
                    Plantilla
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="blank">Documento en blanco</option>
                      <option value="promotion">Promocion</option>
                      <option value="appeal">Recurso de apelacion</option>
                      <option value="notes">Notas de audiencia</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => createFromTemplate().then(() => setFileMenuOpen(false)).catch((error) => setMessage(error.message))}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                  >
                    <FilePlus2 className="h-4 w-4" /> Nuevo documento
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => importDocument().then(() => setFileMenuOpen(false)).catch((error) => setMessage(error.message))}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                  >
                    <Upload className="h-4 w-4" /> Abrir documento
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit || !activeDocument}
                    onClick={() => saveDocument({ createVersion: true }).then(() => setFileMenuOpen(false)).catch(() => undefined)}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" /> Guardar
                  </button>
                  <button
                    type="button"
                    disabled={!activeDocument}
                    onClick={() => printDocument().then(() => setFileMenuOpen(false)).catch(() => undefined)}
                    className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                  >
                    <Printer className="h-4 w-4" /> Imprimir
                  </button>
                  <div className="my-2 border-t border-slate-200" />
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Exportar como</p>
                  {[
                    ['docx', 'Word (.docx)'],
                    ['doc', 'Word 97-2003 (.doc)'],
                    ['odt', 'OpenDocument (.odt)'],
                    ['odf', 'OpenDocument (.odf)'],
                    ['pdf', 'PDF'],
                    ['html', 'HTML'],
                    ['txt', 'Texto (.txt)'],
                  ].map(([format, label]) => (
                    <button
                      key={format}
                      type="button"
                      disabled={!activeDocument}
                      onClick={() => {
                        exportDocument(format as EscribaDocumentPayload['format']);
                        setFileMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                    >
                      <Download className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              title={documentListOpen ? 'Ocultar documentos' : 'Mostrar documentos'}
              onClick={() => setDocumentListOpen((current) => !current)}
              className={`grid h-9 w-9 place-items-center rounded border transition ${documentListOpen ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <FileText className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <EditorToolbar editor={editor} canEdit={canEdit} onImage={() => imageInputRef.current?.click()} />

      <div className={`grid min-h-[calc(100vh-218px)] ${editorGridClass}`}>
        {documentListOpen && (
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar documentos"
                className="h-9 w-full rounded border border-slate-300 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-305px)] overflow-y-auto">
            {filteredDocuments.map((document) => {
              const expediente = expedientes.find((item) => item.id === document.expediente_id);
              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => selectDocument(document)}
                  className={`w-full border-b border-slate-100 px-3 py-3 text-left transition-colors ${
                    activeDocument?.id === document.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-800">{document.titulo}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {expediente ? `Exp. ${expediente.numero_expediente}` : 'Sin expediente'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(document.updated_at)}</p>
                </button>
              );
            })}
          </div>
        </aside>
        )}

        <main className="min-w-0 bg-slate-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-2">
            <input
              value={title}
              disabled={!canEdit}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 min-w-[220px] flex-1 border-0 bg-transparent px-1 text-base font-semibold text-slate-900 focus:ring-0"
              placeholder="Titulo del documento"
            />
            <select
              value={expedienteId}
              disabled={!canEdit}
              onChange={(event) => {
                setExpedienteId(event.target.value);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 max-w-60 rounded border border-slate-300 bg-white px-2 text-xs"
              title="Vincular expediente"
            >
              <option value="">Sin expediente</option>
              {expedientes.map((item) => (
                <option key={item.id} value={item.id}>{item.numero_expediente} · {item.partes}</option>
              ))}
            </select>
            <select
              value={pageSize}
              disabled={!canEdit}
              onChange={(event) => {
                setPageSize(event.target.value as EscribaPageSize);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="letter">Carta</option>
              <option value="a4">A4</option>
              <option value="legal">Oficio</option>
            </select>
            <select
              value={orientation}
              disabled={!canEdit}
              onChange={(event) => {
                setOrientation(event.target.value as EscribaOrientation);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="portrait">Vertical</option>
              <option value="landscape">Horizontal</option>
            </select>
            <select
              value={
                margins.top <= 13 ? 'narrow'
                  : margins.top >= 31 ? 'wide'
                    : 'normal'
              }
              disabled={!canEdit}
              onChange={(event) => {
                const nextMargins = event.target.value === 'narrow'
                  ? { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 }
                  : event.target.value === 'wide'
                    ? { top: 31.8, right: 31.8, bottom: 31.8, left: 31.8 }
                    : defaultEscribaMargins;
                setMargins(nextMargins);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
              title="Margenes"
            >
              <option value="normal">Margen normal</option>
              <option value="narrow">Margen estrecho</option>
              <option value="wide">Margen amplio</option>
            </select>
            <select
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
              title="Zoom"
            >
              <option value={0.65}>65%</option>
              <option value={0.8}>80%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
            </select>
            <select
              value={status}
              disabled={!canEdit}
              onChange={(event) => {
                setStatus(event.target.value as EscribaStatus);
                setDirty(true);
                setChangeCounter((value) => value + 1);
              }}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs"
            >
              <option value="draft">Borrador</option>
              <option value="review">En revision</option>
              <option value="final">Final</option>
            </select>
            <button
              type="button"
              title="Eliminar documento"
              disabled={!canEdit || !activeDocument}
              onClick={() => removeDocument().catch((error) => setMessage(error.message))}
              className="grid h-9 w-9 place-items-center rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-35"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {message && (
            <div className="flex items-center justify-between border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
              <span>{message}</span>
              <button type="button" title="Cerrar aviso" onClick={() => setMessage('')}><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="max-h-[calc(100vh-338px)] overflow-auto p-6">
            <article
              className="escriba-page mx-auto bg-white shadow-lg transition-[width,min-height,padding]"
              style={{ ...pageStyle, zoom }}
            >
              <EditorContent editor={editor} />
            </article>
          </div>
          <footer className="flex items-center justify-between border-t border-slate-300 bg-white px-4 py-2 text-xs text-slate-500">
            <span>{editor.storage.characterCount.words()} palabras · {editor.storage.characterCount.characters()} caracteres</span>
            <span>{pageSize.toUpperCase()} · {orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</span>
          </footer>
        </main>

        <aside className="border-l border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <div className="grid h-8 w-8 place-items-center rounded bg-blue-700 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Juris IA</p>
              <p className="text-xs text-slate-500">Asistente de redaccion</p>
            </div>
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-4">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-blue-700 text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Redaccion asistida</h3>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {expedienteId ? 'Usara el expediente y la biblioteca juridica.' : 'Vincula un expediente para usar sus datos.'}
                  </p>
                </div>
              </div>
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={7}
                placeholder="Ejemplo: redacta los antecedentes y el primer agravio contra la resolucion..."
                className="w-full resize-none rounded border border-slate-300 p-3 text-sm"
              />
              <select
                value={aiDestination}
                onChange={(event) => setAiDestination(event.target.value as AIDestination)}
                className="mt-2 h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="insert">Insertar en el cursor</option>
                <option value="selection">Reemplazar seleccion</option>
                <option value="replace">Reemplazar documento</option>
              </select>
              <button
                type="button"
                disabled={!canEdit || aiWorking || !aiPrompt.trim()}
                onClick={() => runAI().catch(() => undefined)}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
              >
                {aiWorking ? <Braces className="h-4 w-4 animate-pulse" /> : <Wand2 className="h-4 w-4" />}
                {aiWorking ? 'Redactando...' : 'Generar con Juris'}
              </button>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Acciones rapidas</p>
                {[
                  'Corrige ortografia y mejora la claridad del texto seleccionado.',
                  'Resume el documento actual en puntos breves.',
                  'Convierte el texto seleccionado a tono juridico formal.',
                  'Revisa si faltan fechas, autoridades o peticiones.',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setAiPrompt(prompt)}
                    className="mb-2 w-full rounded border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-800"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen((current) => !current)}
                className="mt-4 flex w-full items-center justify-between rounded border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2"><FileClock className="h-4 w-4 text-blue-700" /> Versiones del documento</span>
                <span>{historyOpen ? 'Ocultar' : `${versions.length}`}</span>
              </button>
          </div>

          {historyOpen && (
            <div className="max-h-[calc(100vh-305px)] overflow-y-auto p-4">
              <p className="mb-3 text-xs text-slate-500">Las versiones se crean al guardar manualmente.</p>
              {versions.length === 0 && (
                <p className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Aun no hay versiones.</p>
              )}
              {versions.map((version) => (
                <div key={version.id} className="border-b border-slate-200 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">Versión {version.version_number}</p>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => restoreVersion(version).catch((error) => setMessage(error.message))}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-40"
                    >
                      Restaurar
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{version.etiqueta}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(version.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
