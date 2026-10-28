import { createHash } from 'node:crypto';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 1_500_000;

const assertAllowedStorageUrl = (rawUrl) => {
  const url = new URL(rawUrl);
  const allowedHost = url.hostname.endsWith('.supabase.co');
  const allowedPath = url.pathname.startsWith('/storage/v1/object/sign/despacho-document-files/');

  if (url.protocol !== 'https:' || !allowedHost || !allowedPath) {
    throw new Error('La direccion del documento no pertenece al almacenamiento autorizado.');
  }

  return url;
};

const fetchDocument = async (rawUrl) => {
  const url = assertAllowedStorageUrl(rawUrl);
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el documento (${response.status}).`);
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_DOCUMENT_BYTES) {
    throw new Error('El documento supera el limite permitido de 25 MB.');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error('El documento supera el limite permitido de 25 MB.');
  }

  return bytes;
};

const normalizeExtractedText = (value) => value
  .replace(/\u0000/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n\n')
  .trim()
  .slice(0, MAX_EXTRACTED_CHARACTERS);

const extractPdf = async (bytes) => {
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const document = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) pages.push(`[Pagina ${pageNumber}]\n${text}`);
  }

  const extractedText = normalizeExtractedText(pages.join('\n\n'));
  return {
    status: extractedText.length >= 40 ? 'ready' : 'needs_ocr',
    extractionMethod: extractedText.length >= 40 ? 'pdf_text' : 'pdf_requires_ocr',
    extractedText,
    pageCount: document.numPages,
    errorMessage: extractedText.length >= 40
      ? null
      : 'El PDF parece ser una imagen escaneada y requiere reconocimiento OCR.',
  };
};

const extractDocx = async (bytes) => {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const extractedText = normalizeExtractedText(result.value);

  return {
    status: extractedText ? 'ready' : 'failed',
    extractionMethod: 'docx_text',
    extractedText,
    pageCount: null,
    errorMessage: extractedText ? null : 'El archivo DOCX no contiene texto extraible.',
  };
};

export const extractDocumentText = async ({ url, fileName, fileType }) => {
  const bytes = await fetchDocument(url);
  const extension = String(fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  const normalizedType = String(fileType ?? '').toLowerCase();
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  let result;
  if (normalizedType === 'application/pdf' || extension === 'pdf') {
    result = await extractPdf(bytes);
  } else if (
    normalizedType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || extension === 'docx'
  ) {
    result = await extractDocx(bytes);
  } else {
    result = {
      status: 'unsupported',
      extractionMethod: null,
      extractedText: '',
      pageCount: null,
      errorMessage: extension === 'doc'
        ? 'El formato Word .doc antiguo debe convertirse a .docx o PDF.'
        : 'Este tipo de archivo requiere OCR o conversion antes de poder leerse.',
    };
  }

  return { ok: true, sha256, ...result };
};
