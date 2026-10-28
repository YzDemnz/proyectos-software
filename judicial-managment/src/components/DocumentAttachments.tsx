import { Download, ExternalLink, Eye, FilePenLine, FileText, Image as ImageIcon, Paperclip, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import {
  acceptDocumentFileTypes,
  canOpenDocumentInEscriba,
  formatDocumentFileSize,
  isImageDocumentAttachment,
  isPdfDocumentAttachment,
  validateDocumentFiles,
  type EscribaAttachmentRequest,
} from '../lib/documentAttachments';
import type { DocumentAttachment } from '../lib/supabase';

interface DocumentAttachmentListProps {
  attachments: DocumentAttachment[];
  attachmentUrls: Record<string, string>;
  compact?: boolean;
  emptyText?: string;
  relationshipLabel?: string;
  linkedExpedienteId?: string | null;
  uploadedByNames?: Record<string, string>;
  onOpenInEscriba?: (request: EscribaAttachmentRequest) => void;
}

interface DocumentFilePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

interface DocumentQuickUploadProps {
  onUpload: (files: File[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}

export function DocumentAttachmentList({
  attachments,
  attachmentUrls,
  compact = false,
  emptyText,
  relationshipLabel,
  linkedExpedienteId,
  uploadedByNames = {},
  onOpenInEscriba,
}: DocumentAttachmentListProps) {
  const [previewAttachment, setPreviewAttachment] = useState<DocumentAttachment | null>(null);

  if (attachments.length === 0) {
    return emptyText ? <p className="text-xs text-slate-500">{emptyText}</p> : null;
  }

  const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  const openFile = async (url: string) => {
    if (!url) return;
    if (window.judicialDesktop?.openExternalUrl) {
      await window.judicialDesktop.openExternalUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const previewUrl = previewAttachment ? attachmentUrls[previewAttachment.id] : '';

  return (
    <>
      <div className={compact ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
      {attachments.map((attachment) => {
        const signedUrl = attachmentUrls[attachment.id];
        const isImage = isImageDocumentAttachment(attachment);
        const uploadedBy = uploadedByNames[attachment.uploaded_by] ?? 'Colaborador del despacho';

        return (
          <button
            type="button"
            key={attachment.id}
            onClick={() => setPreviewAttachment(attachment)}
            className="block w-full overflow-hidden rounded-md border border-blue-100 bg-white text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            {isImage && signedUrl && !compact && (
              <img
                src={signedUrl}
                alt={attachment.file_name}
                className="max-h-40 w-full object-cover"
              />
            )}
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="rounded-md bg-blue-50 p-2 text-blue-700">
                {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{attachment.file_name}</p>
                <p className="text-xs text-slate-500">{formatDocumentFileSize(attachment.file_size)} - {formatDate(attachment.created_at)}</p>
                {!compact && <p className="mt-1 truncate text-xs text-slate-500">Subido por {uploadedBy}</p>}
              </div>
              <Eye className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        );
      })}
      </div>

      {previewAttachment && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Vista previa del documento">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="rounded-md bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                {isImageDocumentAttachment(previewAttachment) ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-slate-950 dark:text-white">{previewAttachment.file_name}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{relationshipLabel ?? (previewAttachment.target_type === 'expediente' ? 'Documento de expediente' : 'Documento de movimiento')}</p>
              </div>
              <button type="button" onClick={() => setPreviewAttachment(null)} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" title="Cerrar vista previa">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_260px]">
              <div className="min-h-[280px] overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
                {isImageDocumentAttachment(previewAttachment) && previewUrl ? (
                  <img src={previewUrl} alt={previewAttachment.file_name} className="mx-auto max-h-[58dvh] rounded-md object-contain shadow-sm" />
                ) : isPdfDocumentAttachment(previewAttachment) && previewUrl ? (
                  <iframe title={previewAttachment.file_name} src={previewUrl} className="h-[58dvh] w-full rounded-md border border-slate-200 bg-white" />
                ) : (
                  <div className="mx-auto flex h-full min-h-[260px] max-w-md flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                    <FileText className="h-10 w-10 text-blue-700 dark:text-blue-300" />
                    <p className="mt-4 font-semibold text-slate-800 dark:text-slate-100">Vista previa no disponible para este formato</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Puedes descargarlo o abrir una copia editable en Escriba cuando el formato sea compatible.</p>
                  </div>
                )}
              </div>

              <aside className="border-t border-slate-200 p-5 dark:border-slate-700 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Información</p>
                <dl className="mt-4 space-y-4 text-sm">
                  <div><dt className="text-slate-500">Tamaño</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDocumentFileSize(previewAttachment.file_size)}</dd></div>
                  <div><dt className="text-slate-500">Subido</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(previewAttachment.created_at)}</dd></div>
                  <div><dt className="flex items-center gap-1 text-slate-500"><UserRound className="h-3.5 w-3.5" /> Por</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">{uploadedByNames[previewAttachment.uploaded_by] ?? 'Colaborador del despacho'}</dd></div>
                  <div><dt className="text-slate-500">Versión</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">Adjunto original</dd><p className="mt-1 text-xs text-slate-500">Al abrirlo en Escriba se crea una copia editable con historial propio.</p></div>
                  <div><dt className="text-slate-500">Vínculo</dt><dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">{relationshipLabel ?? (previewAttachment.target_type === 'expediente' ? 'Expediente' : 'Movimiento')}</dd></div>
                </dl>

                <div className="mt-6 space-y-2">
                  <button type="button" onClick={() => openFile(previewUrl)} disabled={!previewUrl} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Abrir archivo</button>
                  <a href={previewUrl || undefined} download={previewAttachment.file_name} className={`inline-flex w-full items-center justify-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-200 ${previewUrl ? '' : 'pointer-events-none opacity-50'}`}><Download className="h-4 w-4" />Descargar</a>
                  {onOpenInEscriba && canOpenDocumentInEscriba(previewAttachment) && previewUrl && (
                    <button type="button" onClick={() => { onOpenInEscriba({ attachmentId: previewAttachment.id, fileName: previewAttachment.file_name, signedUrl: previewUrl, expedienteId: previewAttachment.expediente_id ?? linkedExpedienteId ?? null }); setPreviewAttachment(null); }} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"><FilePenLine className="h-4 w-4" />Abrir en Escriba</button>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DocumentFilePicker({
  files,
  onChange,
  onError,
  disabled = false,
  label = 'Adjuntar archivos',
  compact = false,
}: DocumentFilePickerProps) {
  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    const validationMessage = validateDocumentFiles(selectedFiles);
    if (validationMessage) {
      onError(validationMessage);
      return;
    }

    onError('');
    onChange([...files, ...selectedFiles]);
  };

  const removeFile = (indexToRemove: number) => {
    onChange(files.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50">
        <Paperclip className="w-4 h-4" />
        {label}
        <input
          type="file"
          multiple
          disabled={disabled}
          accept={acceptDocumentFileTypes}
          className="hidden"
          onChange={(event) => {
            handleFileSelection(event.target.files);
            event.target.value = '';
          }}
        />
      </label>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950"
            >
              <Paperclip className="w-4 h-4 text-blue-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{file.name}</p>
                <p className="text-xs text-blue-700">{formatDocumentFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="rounded-md p-1 text-blue-700 hover:bg-blue-100"
                title="Quitar archivo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DocumentQuickUpload({
  onUpload,
  onError,
  disabled = false,
  label = 'Adjuntar',
  compact = false,
}: DocumentQuickUploadProps) {
  const handleFileSelection = (fileList: FileList | null) => {
    if (!fileList) return;
    const selectedFiles = Array.from(fileList);
    const validationMessage = validateDocumentFiles(selectedFiles);
    if (validationMessage) {
      onError(validationMessage);
      return;
    }

    onError('');
    onUpload(selectedFiles);
  };

  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-blue-200 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 ${
        compact ? 'px-2 py-1' : 'px-3 py-2'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <Paperclip className="w-4 h-4" />
      {label}
      <input
        type="file"
        multiple
        disabled={disabled}
        accept={acceptDocumentFileTypes}
        className="hidden"
        onChange={(event) => {
          handleFileSelection(event.target.files);
          event.target.value = '';
        }}
      />
    </label>
  );
}
