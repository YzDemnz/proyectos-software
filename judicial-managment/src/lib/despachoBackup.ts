import JSZip from 'jszip';
import { createSignedDocumentUrls } from './documentAttachments';
import { supabase, type DocumentAttachment } from './supabase';

export interface DespachoBackupSummary {
  expedienteCount: number;
  clientCount: number;
  movementCount: number;
  documentCount: number;
  includedFileCount: number;
  skippedFileCount: number;
}

export interface DespachoBackupArchive {
  blob: Blob;
  fileName: string;
  summary: DespachoBackupSummary;
}

const safeFileSegment = (value: string) => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'archivo'
);

const backupFileName = (despachoName: string) => {
  const date = new Date().toISOString().replace(/[:.]/g, '-');
  return `Judicial-${safeFileSegment(despachoName)}-Respaldo-${date}.zip`;
};

const getRows = async <T,>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string) => {
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo incluir ${label}: ${error.message}`);
  return data ?? [];
};

const readBlobAsBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error ?? new Error('No se pudo preparar el respaldo.'));
  reader.onload = () => resolve(String(reader.result ?? '').replace(/^data:application\/zip;base64,/, ''));
  reader.readAsDataURL(blob);
});

export const createDespachoBackup = async ({
  despachoId,
  despachoName,
}: {
  despachoId: string;
  despachoName: string;
}): Promise<DespachoBackupArchive> => {
  const [despachoResult, members, clients, expedientes, movimientos, calendarEvents, escribaDocuments, attachments, chatMessages] = await Promise.all([
    supabase.from('despachos').select('*').eq('id', despachoId).single(),
    getRows(supabase.from('despacho_miembros').select('*').eq('despacho_id', despachoId), 'los colaboradores'),
    getRows(supabase.from('clientes').select('*').eq('despacho_id', despachoId), 'los clientes'),
    getRows(supabase.from('expedientes').select('*').eq('despacho_id', despachoId), 'los expedientes'),
    getRows(supabase.from('movimientos').select('*').eq('despacho_id', despachoId), 'los movimientos'),
    getRows(supabase.from('calendario_eventos').select('*').eq('despacho_id', despachoId), 'el calendario'),
    getRows(supabase.from('escriba_documentos').select('*').eq('despacho_id', despachoId), 'los escritos de Escriba'),
    getRows(supabase.from('document_adjuntos').select('*').eq('despacho_id', despachoId), 'los adjuntos'),
    getRows(supabase.from('despacho_chat_mensajes').select('*').eq('despacho_id', despachoId), 'los mensajes del despacho'),
  ]);

  if (despachoResult.error || !despachoResult.data) {
    throw new Error(`No se pudo incluir el despacho: ${despachoResult.error?.message ?? 'No encontrado.'}`);
  }

  const clientIds = clients.map((client: { id: string }) => client.id);
  const documentIds = escribaDocuments.map((document: { id: string }) => document.id);
  const [clientMovements, escribaVersions, chatAttachments] = await Promise.all([
    clientIds.length
      ? getRows(supabase.from('cliente_movimientos').select('*').in('cliente_id', clientIds), 'los movimientos de clientes')
      : Promise.resolve([]),
    documentIds.length
      ? getRows(supabase.from('escriba_versiones').select('*').in('documento_id', documentIds), 'las versiones de Escriba')
      : Promise.resolve([]),
    getRows(supabase.from('despacho_chat_adjuntos').select('*').eq('despacho_id', despachoId), 'los adjuntos del chat'),
  ]);

  const zip = new JSZip();
  const exportedAt = new Date().toISOString();
  const backupData = {
    schema: 'judicial-managment-despacho-backup/v1',
    exported_at: exportedAt,
    despacho: despachoResult.data,
    members,
    clients,
    client_movements: clientMovements,
    expedientes,
    movimientos,
    calendario_eventos: calendarEvents,
    escriba_documentos: escribaDocuments,
    escriba_versiones: escribaVersions,
    document_adjuntos: attachments,
    despacho_chat_mensajes: chatMessages,
    despacho_chat_adjuntos: chatAttachments,
  };

  zip.file('datos/respaldo.json', JSON.stringify(backupData, null, 2));
  zip.file('LEEME.txt', [
    'Respaldo generado por Judicial Managment.',
    `Despacho: ${despachoName}`,
    `Fecha: ${exportedAt}`,
    '',
    'El archivo datos/respaldo.json contiene los registros estructurados.',
    'La carpeta archivos contiene los adjuntos que se pudieron descargar.',
    'Conserva este ZIP en una ubicacion privada y protegida.',
  ].join('\n'));

  const typedAttachments = attachments as DocumentAttachment[];
  const signedUrls = await createSignedDocumentUrls(typedAttachments);
  let includedFileCount = 0;
  const skippedFiles: Array<{ name: string; reason: string }> = [];

  for (const attachment of typedAttachments) {
    const signedUrl = signedUrls[attachment.id];
    if (!signedUrl) {
      skippedFiles.push({ name: attachment.file_name, reason: 'No se pudo generar un enlace temporal.' });
      continue;
    }

    try {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Descarga ${response.status}`);
      const fileBlob = await response.blob();
      const targetFolder = attachment.target_type === 'expediente' ? 'expedientes' : 'movimientos';
      zip.file(`archivos/${targetFolder}/${attachment.id}-${safeFileSegment(attachment.file_name)}`, fileBlob);
      includedFileCount += 1;
    } catch (error) {
      skippedFiles.push({
        name: attachment.file_name,
        reason: error instanceof Error ? error.message : 'No se pudo descargar el adjunto.',
      });
    }
  }

  if (skippedFiles.length) zip.file('datos/archivos-no-incluidos.json', JSON.stringify(skippedFiles, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return {
    blob,
    fileName: backupFileName(despachoName),
    summary: {
      expedienteCount: expedientes.length,
      clientCount: clients.length,
      movementCount: movimientos.length,
      documentCount: attachments.length,
      includedFileCount,
      skippedFileCount: skippedFiles.length,
    },
  };
};

export const saveDespachoBackup = async ({
  archive,
  automatic,
}: {
  archive: DespachoBackupArchive;
  automatic: boolean;
}) => {
  if (window.judicialDesktop?.saveDespachoBackup) {
    return window.judicialDesktop.saveDespachoBackup({
      fileName: archive.fileName,
      base64: await readBlobAsBase64(archive.blob),
      automatic,
    });
  }

  if (automatic) {
    return { ok: false, error: 'Los respaldos automáticos están disponibles en la app de escritorio.' };
  }

  const objectUrl = URL.createObjectURL(archive.blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = archive.fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return { ok: true };
};
