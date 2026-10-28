import type { JSONContent } from '@tiptap/core';
import { supabase } from './supabase';

export type EscribaPageSize = 'letter' | 'a4' | 'legal';
export type EscribaOrientation = 'portrait' | 'landscape';
export type EscribaStatus = 'draft' | 'review' | 'final';

export interface EscribaMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EscribaDocument {
  id: string;
  despacho_id: string;
  expediente_id?: string | null;
  titulo: string;
  content_json: JSONContent;
  content_html: string;
  plain_text: string;
  page_size: EscribaPageSize;
  orientation: EscribaOrientation;
  margins: EscribaMargins;
  status: EscribaStatus;
  created_by: string;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscribaVersion {
  id: string;
  documento_id: string;
  despacho_id: string;
  version_number: number;
  etiqueta: string;
  content_json: JSONContent;
  content_html: string;
  plain_text: string;
  created_by: string;
  created_at: string;
}

export const defaultEscribaContent: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export const defaultEscribaMargins: EscribaMargins = {
  top: 25.4,
  right: 25.4,
  bottom: 25.4,
  left: 25.4,
};

export const listEscribaDocuments = async (despachoId: string) => {
  const { data, error } = await supabase
    .from('escriba_documentos')
    .select('*')
    .eq('despacho_id', despachoId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EscribaDocument[];
};

export const createEscribaDocument = async ({
  despachoId,
  title = 'Documento sin titulo',
  expedienteId = null,
  contentJson = defaultEscribaContent,
  contentHtml = '<p></p>',
  plainText = '',
}: {
  despachoId: string;
  title?: string;
  expedienteId?: string | null;
  contentJson?: JSONContent;
  contentHtml?: string;
  plainText?: string;
}) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesion para crear documentos.');

  const { data, error } = await supabase
    .from('escriba_documentos')
    .insert([{
      despacho_id: despachoId,
      expediente_id: expedienteId,
      titulo: title,
      content_json: contentJson,
      content_html: contentHtml,
      plain_text: plainText,
      page_size: 'letter',
      orientation: 'portrait',
      margins: defaultEscribaMargins,
      status: 'draft',
      created_by: user.id,
      updated_by: user.id,
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data as EscribaDocument;
};

export const updateEscribaDocument = async (
  documentId: string,
  changes: Partial<Pick<
    EscribaDocument,
    | 'expediente_id'
    | 'titulo'
    | 'content_json'
    | 'content_html'
    | 'plain_text'
    | 'page_size'
    | 'orientation'
    | 'margins'
    | 'status'
  >>,
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para guardar documentos.');

  const { data, error } = await supabase
    .from('escriba_documentos')
    .update({ ...changes, updated_by: user.id })
    .eq('id', documentId)
    .select('*')
    .single();
  if (error) throw error;
  return data as EscribaDocument;
};

export const deleteEscribaDocument = async (documentId: string) => {
  const { error } = await supabase
    .from('escriba_documentos')
    .delete()
    .eq('id', documentId);
  if (error) throw error;
};

export const listEscribaVersions = async (documentId: string) => {
  const { data, error } = await supabase
    .from('escriba_versiones')
    .select('*')
    .eq('documento_id', documentId)
    .order('version_number', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as EscribaVersion[];
};

export const createEscribaVersion = async ({
  document,
  label,
}: {
  document: EscribaDocument;
  label: string;
}) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para crear versiones.');

  const { data: latest } = await supabase
    .from('escriba_versiones')
    .select('version_number')
    .eq('documento_id', document.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNumber = Number(latest?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from('escriba_versiones')
    .insert([{
      documento_id: document.id,
      despacho_id: document.despacho_id,
      version_number: versionNumber,
      etiqueta: label,
      content_json: document.content_json,
      content_html: document.content_html,
      plain_text: document.plain_text,
      created_by: user.id,
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data as EscribaVersion;
};
