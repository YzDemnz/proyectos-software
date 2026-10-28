import { createClient } from '@supabase/supabase-js';
import { secureAuthStorage } from './authStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type WorkspaceMutationEvent = {
  table: string;
};

const workspaceMutationListeners = new Set<(event: WorkspaceMutationEvent) => void>();
const nativeFetch = globalThis.fetch.bind(globalThis);
const mutationMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

export const subscribeWorkspaceMutations = (listener: (event: WorkspaceMutationEvent) => void) => {
  workspaceMutationListeners.add(listener);
  return () => workspaceMutationListeners.delete(listener);
};

const instrumentedFetch: typeof fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  if (!response.ok) return response;

  const inputRecord = typeof input === 'object' && input !== null
    ? input as { method?: string; url?: string }
    : null;
  const method = String(init?.method ?? inputRecord?.method ?? 'GET').toUpperCase();
  if (!mutationMethods.has(method)) return response;

  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : inputRecord?.url ?? '';
  const tableMatch = url.match(/\/rest\/v1\/([^/?]+)/i);
  if (!tableMatch || tableMatch[1].toLocaleLowerCase('en-US') === 'rpc') return response;

  const event = { table: decodeURIComponent(tableMatch[1]) };
  queueMicrotask(() => {
    workspaceMutationListeners.forEach((listener) => listener(event));
  });
  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    persistSession: true,
    storage: secureAuthStorage,
  },
  realtime: {
    timeout: 20_000,
    heartbeatIntervalMs: 25_000,
    reconnectAfterMs: (tries: number) => Math.min(1_000 * 2 ** tries, 10_000),
    worker: false,
  },
  global: {
    fetch: instrumentedFetch,
  },
});

export type DespachoRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type AccountStatus = 'active' | 'disabled' | 'banned';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'manual';

export interface AppProfile {
  id: string;
  email?: string | null;
  role?: 'owner' | 'admin' | 'user';
  account_status?: AccountStatus;
  subscription_status?: SubscriptionStatus;
  subscription_provider?: string | null;
  subscription_reference?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  ban_until?: string | null;
  ban_reason?: string | null;
  disabled_reason?: string | null;
  last_seen_at?: string | null;
  usage_seconds?: number | null;
  telefono?: string | null;
  correo_alternativo?: string | null;
  correo_alternativo_verificado_en?: string | null;
  recovery_email_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type SupportReportStatus = 'new' | 'in_review' | 'waiting_user' | 'resolved' | 'closed';
export type SupportReportPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportReport {
  id: string;
  user_id: string;
  despacho_id?: string | null;
  category: 'error' | 'sugerencia' | 'cuenta' | 'seguridad' | 'privacidad' | 'datos' | 'actualizacion' | 'otro';
  title: string;
  description: string;
  steps_to_reproduce: string;
  expected_behavior: string;
  contains_sensitive_data: boolean;
  status: SupportReportStatus;
  priority: SupportReportPriority;
  app_version?: string | null;
  platform?: string | null;
  admin_notes?: string | null;
  admin_reply?: string | null;
  assigned_to?: string | null;
  reviewed_at?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformDonation {
  id: string;
  user_id?: string | null;
  donor_email?: string | null;
  amount_mxn: number;
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  provider: string;
  external_reference?: string | null;
  message?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSecurityAlert {
  id: string;
  source: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  user_id?: string | null;
  despacho_id?: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  metadata: Record<string, unknown>;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Despacho {
  id: string;
  nombre: string;
  owner_user_id: string;
  deleted_at?: string | null;
  delete_after?: string | null;
  deletion_requested_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DespachoMember {
  id: string;
  despacho_id: string;
  user_id: string;
  email: string;
  role: DespachoRole;
  display_name?: string | null;
  profile_color?: string | null;
  avatar_url?: string | null;
  profile_updated_at?: string | null;
  created_at: string;
  despacho?: Despacho;
}

export interface DespachoInvitation {
  id: string;
  despacho_id: string;
  codigo: string;
  role: Exclude<DespachoRole, 'owner'>;
  max_usos: number;
  usos: number;
  expires_at?: string | null;
  valid_on?: string | null;
  revoked: boolean;
  created_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  monto_pactado: number;
  total_adeudo: number;
  despacho_id?: string;
  created_at: string;
}

export interface ClienteMovimiento {
  id: string;
  cliente_id: string;
  tipo: 'cargo' | 'abono';
  monto: number;
  descripcion: string;
  despacho_id?: string;
  created_at: string;
}

export interface Expediente {
  id: string;
  numero_expediente: string;
  partes: string;
  juzgado: string;
  materia?: string;
  tipo_juicio?: string;
  estatus: string;
  cliente_id?: string;
  owner_user_id?: string;
  despacho_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Movimiento {
  id: string;
  expediente_id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  despacho_id?: string;
  created_at: string;
}

export interface CalendarioEvento {
  id: string;
  despacho_id: string;
  expediente_id?: string | null;
  movimiento_id?: string | null;
  titulo: string;
  descripcion: string;
  event_date: string;
  event_time?: string | null;
  tipo: string;
  notify_day_before: boolean;
  notify_same_day: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DespachoChatMensaje {
  id: string;
  despacho_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
}

export interface DespachoChatAdjunto {
  id: string;
  message_id: string;
  despacho_id: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface ModerationFlag {
  id: string;
  despacho_id: string;
  message_id: string;
  user_id: string;
  matched_category: string;
  matched_terms: string[];
  excerpt: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'banned';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
  created_at: string;
}

export type DocumentAttachmentTarget = 'expediente' | 'movimiento';

export interface DocumentAttachment {
  id: string;
  despacho_id: string;
  target_type: DocumentAttachmentTarget;
  expediente_id?: string | null;
  movimiento_id?: string | null;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export interface DocumentExtraction {
  id: string;
  attachment_id: string;
  despacho_id: string;
  expediente_id?: string | null;
  movimiento_id?: string | null;
  status: 'pending' | 'processing' | 'ready' | 'needs_ocr' | 'unsupported' | 'failed';
  extraction_method?: string | null;
  extracted_text: string;
  page_count?: number | null;
  sha256?: string | null;
  error_message?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type LaboralSeccion = 'conciliacion' | 'junta_local' | 'tribunal_laboral';
export type LaboralProcedimiento = 'normal' | 'especial';

export interface LaboralAsunto {
  id: string;
  despacho_id: string;
  seccion: LaboralSeccion;
  numero_expediente?: string | null;
  partes: string;
  procedimiento?: LaboralProcedimiento | null;
  fecha_conciliacion?: string | null;
  hoja_conciliacion?: boolean | null;
  estatus: string;
  notas: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TribunalLaboral {
  id: string;
  nombre: string;
  direccion: string;
  telefono?: string;
  email?: string;
  hoja_no_conciliacion: boolean;
  despacho_id?: string;
  created_at: string;
}
