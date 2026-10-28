import { supabase, type DocumentAttachment, type DocumentAttachmentTarget } from './supabase';

export const documentFilesBucket = 'despacho-document-files';
export const maxDocumentFileSize = 100 * 1024 * 1024;

const allowedMimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const acceptDocumentFileTypes = '*/*';

export const formatDocumentFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const getDocumentFileExtension = (fileName: string) => {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
};

export const getSupportedDocumentFileType = (file: File) => {
  const extension = getDocumentFileExtension(file.name);
  return (allowedMimeByExtension[extension] ?? file.type) || 'application/octet-stream';
};

export const isAllowedDocumentFile = (file: File) => {
  void file;
  return true;
};

export const validateDocumentFiles = (files: File[]) => {
  const oversizedFile = files.find((file) => file.size > maxDocumentFileSize);
  if (oversizedFile) {
    return `"${oversizedFile.name}" pesa mas de 100 MB.`;
  }

  return '';
};

export const isImageDocumentAttachment = (attachment: DocumentAttachment) => {
  return attachment.file_type.startsWith('image/');
};

export const isPdfDocumentAttachment = (attachment: DocumentAttachment) => (
  attachment.file_type === 'application/pdf' || getDocumentFileExtension(attachment.file_name) === 'pdf'
);

export const canOpenDocumentInEscriba = (attachment: DocumentAttachment) => (
  ['doc', 'docx', 'odt', 'odf', 'rtf', 'html', 'htm', 'txt'].includes(getDocumentFileExtension(attachment.file_name))
);

export interface EscribaAttachmentRequest {
  attachmentId: string;
  fileName: string;
  signedUrl: string;
  expedienteId?: string | null;
}

const safeFileName = (fileName: string) => {
  const extension = getDocumentFileExtension(fileName);
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'archivo';

  return extension ? `${baseName}.${extension}` : baseName;
};

const getTargetFolder = (targetType: DocumentAttachmentTarget) => {
  return targetType === 'expediente' ? 'expedientes' : 'movimientos';
};

export const createSignedDocumentUrls = async (attachments: DocumentAttachment[]) => {
  const signedUrlPairs = await Promise.all(
    attachments.map(async (attachment) => {
      const { data } = await supabase.storage
        .from(documentFilesBucket)
        .createSignedUrl(attachment.storage_path, 60 * 60);

      return [attachment.id, data?.signedUrl ?? ''] as const;
    }),
  );

  return Object.fromEntries(signedUrlPairs);
};

export const uploadDocumentAttachments = async ({
  despachoId,
  targetType,
  targetId,
  files,
}: {
  despachoId: string;
  targetType: DocumentAttachmentTarget;
  targetId: string;
  files: File[];
}) => {
  const validationMessage = validateDocumentFiles(files);
  if (validationMessage) return { error: validationMessage };
  if (files.length === 0) return { error: '' };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return { error: 'Debes iniciar sesión para adjuntar archivos.' };

  for (const [index, file] of files.entries()) {
    const fileType = getSupportedDocumentFileType(file);
    const storagePath = [
      despachoId,
      getTargetFolder(targetType),
      targetId,
      `${Date.now()}-${index}-${safeFileName(file.name)}`,
    ].join('/');

    const { error: uploadError } = await supabase.storage
      .from(documentFilesBucket)
      .upload(storagePath, file, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) return { error: uploadError.message };

    const { error: insertError } = await supabase.from('document_adjuntos').insert([
      {
        despacho_id: despachoId,
        target_type: targetType,
        expediente_id: targetType === 'expediente' ? targetId : null,
        movimiento_id: targetType === 'movimiento' ? targetId : null,
        storage_path: storagePath,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        uploaded_by: userId,
      },
    ]);

    if (insertError) {
      await supabase.storage.from(documentFilesBucket).remove([storagePath]);
      return { error: insertError.message };
    }
  }

  return { error: '' };
};
