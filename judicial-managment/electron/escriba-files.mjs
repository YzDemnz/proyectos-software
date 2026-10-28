import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import HtmlToDocx from '@turbodocx/html-to-docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const decodeHtmlEntities = (value) => String(value ?? '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;/gi, "'")
  .replace(/&apos;/gi, "'");

const htmlToTextBlocks = (html) => String(html ?? '')
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\/\s*(p|div|h1|h2|h3|li|tr)\s*>/gi, '\n')
  .replace(/<\s*li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, '')
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => decodeHtmlEntities(line).replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const findLibreOffice = async () => {
  const candidates = [
    process.env.ESCRIBA_LIBREOFFICE_PATH,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    process.platform === 'darwin'
      ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
      : '/usr/bin/libreoffice',
    '/usr/bin/soffice',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
    }
  }
  return null;
};

const withTemporaryDirectory = async (callback) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'escriba-'));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
};

const runLibreOfficeConversion = async ({
  inputPath,
  outputDirectory,
  convertTo,
}) => {
  const soffice = await findLibreOffice();
  if (!soffice) {
    throw new Error('Este formato requiere LibreOffice. Instala LibreOffice o usa DOCX, PDF, HTML o TXT.');
  }

  const profileDirectory = path.join(outputDirectory, 'lo-profile');
  await fs.mkdir(profileDirectory, { recursive: true });
  await execFileAsync(
    soffice,
    [
      `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
      '--headless',
      '--convert-to',
      convertTo,
      '--outdir',
      outputDirectory,
      inputPath,
    ],
    { windowsHide: true, timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
  );
};

const convertDocxToHtml = async (buffer) => {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const imageBuffer = await image.read('base64');
        return { src: `data:${image.contentType};base64,${imageBuffer}` };
      }),
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => p.escriba-subtitle:fresh",
      ],
    },
  );

  return {
    html: result.value || '<p></p>',
    warnings: result.messages.map((message) => message.message),
  };
};

export const importEscribaFile = async (filePath) => {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error('El archivo supera el limite de 50 MB.');
  }

  const extension = path.extname(filePath).toLowerCase();
  const title = path.basename(filePath, extension);
  if (extension === '.txt') {
    const text = await fs.readFile(filePath, 'utf8');
    return {
      title,
      html: text
        .split(/\r?\n/)
        .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
        .join(''),
      sourceFormat: 'txt',
      warnings: [],
    };
  }

  if (extension === '.html' || extension === '.htm') {
    return {
      title,
      html: await fs.readFile(filePath, 'utf8'),
      sourceFormat: extension.slice(1),
      warnings: [],
    };
  }

  if (extension === '.docx') {
    const converted = await convertDocxToHtml(await fs.readFile(filePath));
    return { title, ...converted, sourceFormat: 'docx' };
  }

  if (['.doc', '.odt', '.odf', '.rtf'].includes(extension)) {
    return withTemporaryDirectory(async (directory) => {
      const localInput = path.join(directory, path.basename(filePath));
      await fs.copyFile(filePath, localInput);
      await runLibreOfficeConversion({
        inputPath: localInput,
        outputDirectory: directory,
        convertTo: 'docx',
      });

      const convertedPath = path.join(directory, `${path.basename(filePath, extension)}.docx`);
      const converted = await convertDocxToHtml(await fs.readFile(convertedPath));
      return {
        title,
        ...converted,
        sourceFormat: extension.slice(1),
        warnings: [
          `El archivo ${extension} se convirtio localmente a DOCX para editarlo.`,
          ...converted.warnings,
        ],
      };
    });
  }

  throw new Error('Formato no compatible. Usa DOCX, DOC, ODT, ODF, RTF, HTML o TXT.');
};

const pageDimensions = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11907, height: 16839 },
  legal: { width: 12240, height: 20160 },
};

const buildDocumentHtml = ({
  title,
  html,
  pageSize,
  orientation,
  margins,
}) => {
  const size = pageSize === 'a4' ? 'A4' : pageSize === 'legal' ? 'legal' : 'letter';
  const pageOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
  const safeMargins = {
    top: Number(margins?.top) || 25.4,
    right: Number(margins?.right) || 25.4,
    bottom: Number(margins?.bottom) || 25.4,
    left: Number(margins?.left) || 25.4,
  };

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${size} ${pageOrientation};
      margin: ${safeMargins.top}mm ${safeMargins.right}mm ${safeMargins.bottom}mm ${safeMargins.left}mm;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
    h1, h2, h3 { page-break-after: avoid; }
    h1 { font-size: 22pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; }
    p { margin: 0 0 8pt; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
    th, td { border: 1px solid #334155; padding: 5pt; vertical-align: top; }
    blockquote { border-left: 3px solid #94a3b8; margin-left: 0; padding-left: 12pt; color: #334155; }
    img { max-width: 100%; height: auto; }
    .page-break { break-after: page; page-break-after: always; height: 0; }
    ul[data-type="taskList"] { list-style: none; padding-left: 0; }
    ul[data-type="taskList"] li { display: flex; gap: 6pt; }
  </style>
</head>
<body>${html}</body>
</html>`;
};

export const createEscribaDocx = async (payload) => {
  const dimensions = pageDimensions[payload.pageSize] ?? pageDimensions.letter;
  const orientation = payload.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margin = (millimeters) => Math.round((Number(millimeters) || 25.4) * 56.6929);
  const html = buildDocumentHtml(payload);
  const output = await HtmlToDocx(html, null, {
    title: payload.title,
    creator: 'Escriba - Judicial Managment',
    orientation,
    pageSize: orientation === 'landscape'
      ? { width: dimensions.height, height: dimensions.width }
      : dimensions,
    margins: {
      top: margin(payload.margins?.top),
      right: margin(payload.margins?.right),
      bottom: margin(payload.margins?.bottom),
      left: margin(payload.margins?.left),
    },
    pageNumber: true,
    footer: true,
  });

  return Buffer.from(output);
};

export const createEscribaLegacyDoc = async (payload) => {
  const html = buildDocumentHtml(payload).replace(
    '<head>',
    '<head><meta name="ProgId" content="Word.Document"><meta name="Generator" content="Escriba - Judicial Managment">',
  );
  return Buffer.from(html, 'utf8');
};

export const createEscribaOdt = async (payload) => {
  const zip = new JSZip();
  const paragraphs = htmlToTextBlocks(payload.html);
  const safeTitle = escapeXml(payload.title || 'Documento');
  const body = paragraphs.length
    ? paragraphs.map((line) => `<text:p text:style-name="Standard">${escapeXml(line)}</text:p>`).join('\n')
    : '<text:p text:style-name="Standard" />';

  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`);
  zip.file('meta.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta><dc:title>${safeTitle}</dc:title><dc:creator>Escriba - Judicial Managment</dc:creator></office:meta>
</office:document-meta>`);
  zip.file('styles.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:styles>
    <style:style style:name="Standard" style:family="paragraph">
      <style:text-properties fo:font-size="12pt" fo:font-family="Arial"/>
      <style:paragraph-properties fo:margin-bottom="8pt" fo:line-height="150%"/>
    </style:style>
  </office:styles>
</office:document-styles>`);
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2">
  <office:automatic-styles/>
  <office:body><office:text>${body}</office:text></office:body>
</office:document-content>`);

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
};

export const exportWithLibreOffice = async (payload, outputPath, convertTo) => {
  return withTemporaryDirectory(async (directory) => {
    const htmlPath = path.join(directory, 'documento.html');
    await fs.writeFile(htmlPath, buildDocumentHtml(payload), 'utf8');
    await runLibreOfficeConversion({
      inputPath: htmlPath,
      outputDirectory: directory,
      convertTo,
    });

    const extension = convertTo.split(':')[0];
    const generatedPath = path.join(directory, `documento.${extension}`);
    await fs.copyFile(generatedPath, outputPath);
  });
};

export const getEscribaPrintableHtml = buildDocumentHtml;
