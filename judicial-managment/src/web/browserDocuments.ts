import DOMPurify from 'dompurify';
import JSZip from 'jszip';
const MAX_BYTES = 50 * 1024 * 1024;
const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const paragraphs = (text: string) => text.split(/\r?\n/).map(line => `<p>${escape(line) || '<br>'}</p>`).join('');
const extension = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const safeHtml = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['script','style','iframe','object','embed','form'] });
const asText = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

async function parseFile(file: File): Promise<EscribaFileResult> {
  if (file.size > MAX_BYTES) throw new Error('El archivo supera 50 MB. Divide el documento antes de importarlo.');
  const ext = extension(file.name);
  let html = '';
  const warnings: string[] = [];
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser');
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    html = result.value; if (result.messages.length) warnings.push('Revisa el formato del documento importado.');
  } else if (['odt','odf'].includes(ext)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const content = zip.file('content.xml');
    if (!content) throw new Error('El documento OpenDocument no contiene texto válido.');
    const text = await content.async('string');
    if (text.length > 2_000_000) throw new Error('El contenido es demasiado extenso.');
    const xml = new DOMParser().parseFromString(text,'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('El documento OpenDocument está dañado.');
    html = [...xml.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0','p')].map(node => `<p>${escape(node.textContent || '')}</p>`).join('');
    warnings.push('OpenDocument se importa como texto; revisa estilos e imágenes.');
  } else if (ext === 'pdf') {
    const result = await extractPdf(await file.arrayBuffer()); html = paragraphs(result.text);
    if (!result.text.trim()) throw new Error('Este PDF es una imagen escaneada y necesita reconocimiento de texto (OCR).');
    warnings.push('PDF importado como texto editable. Revisa el orden y los saltos de página.');
  } else if (['html','htm'].includes(ext)) html = await file.text();
  else if (ext === 'doc') {
    const text = await file.text();
    if (!/^\s*(<!doctype|<html|<\?xml)/i.test(text)) throw new Error('Este archivo DOC antiguo requiere conversión. Guárdalo como DOCX para abrirlo en la web.');
    html = text;
  } else if (['txt','md','csv'].includes(ext)) html = paragraphs(await file.text());
  else throw new Error('Abre un archivo DOCX, ODT, PDF, HTML o TXT.');
  return { ok:true, title:file.name.replace(/\.[^.]+$/,''), html:safeHtml(html), sourceFormat:ext, warnings };
}

export function importBrowserDocument(): Promise<EscribaFileResult> {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type='file'; input.accept='.docx,.doc,.odt,.odf,.pdf,.html,.htm,.txt,.md';
    const finish = (result: EscribaFileResult) => { input.remove(); resolve(result); };
    input.addEventListener('cancel',()=>finish({ok:false,canceled:true}),{once:true});
    input.addEventListener('change',()=>{const file=input.files?.[0]; if(!file){finish({ok:false,canceled:true});return;} void parseFile(file).then(finish).catch(error=>finish({ok:false,error:error.message}));},{once:true});
    input.hidden=true;document.body.append(input);input.click();
  });
}
async function fetchFile(url: string, name: string): Promise<File> {
  const parsed = new URL(url);
  // Only fetch attachments from this application's storage; no arbitrary network targets.
  if (parsed.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin || !parsed.pathname.startsWith('/storage/v1/')) throw new Error('La ubicación del documento no es válida.');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('El enlace del archivo venció. Vuelve a abrirlo.');
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('El archivo supera 50 MB.');
  const reader=response.body?.getReader(); if(!reader)throw new Error('El archivo está vacío.');
  const chunks: Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('El archivo supera 50 MB.');}chunks.push(new Uint8Array(value));}
  return new File(chunks,name,{type:response.headers.get('content-type')||''});
}
export async function importBrowserDocumentFromUrl(input: {url:string;fileName:string}): Promise<EscribaFileResult> { try{return await parseFile(await fetchFile(input.url,input.fileName));}catch(error){return {ok:false,error:error instanceof Error?error.message:'No se pudo abrir el documento.'};} }
async function extractPdf(buffer: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({data:buffer});
  const document = await task.promise;
  try { if(document.numPages>200)throw new Error('Este PDF tiene más de 200 páginas. Divídelo para analizarlo.');const pages:string[]=[];for(let page=1;page<=document.numPages;page++){const content=await (await document.getPage(page)).getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));if(pages.join('').length>160_000)break;}return {text:pages.join('\n\n').slice(0,160_000),pages:document.numPages}; } finally { await task.destroy(); }
}
export async function extractBrowserDocumentText(input: {url:string;fileName:string;fileType?:string}): Promise<DocumentTextExtractionResult> {
  try { const file=await fetchFile(input.url,input.fileName); if(extension(file.name)==='pdf'){const result=await extractPdf(await file.arrayBuffer());return {ok:!!result.text.trim(),status:result.text.trim()?'ready':'needs_ocr',extractedText:result.text,pageCount:result.pages,extractionMethod:'pdfjs-browser',errorMessage:result.text.trim()?null:'El PDF necesita OCR.'};} const parsed=await parseFile(file);return {ok:true,status:'ready',extractedText:asText(parsed.html||'').slice(0,160_000),extractionMethod:'browser-document'}; }
  catch(error){return {ok:false,status:'unsupported',errorMessage:error instanceof Error?error.message:'No se pudo leer el documento.'};}
}
function documentHtml(payload:EscribaDocumentPayload){const margins=payload.margins;return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(payload.title)}</title><style>@page{size:${payload.pageSize==='letter'?'letter':payload.pageSize==='legal'?'legal':'A4'} ${payload.orientation};margin:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm}body{font:12pt Georgia,serif;line-height:1.5}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:6px}</style></head><body>${safeHtml(payload.html)}</body></html>`;}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
export async function printBrowserDocument(payload:EscribaDocumentPayload):Promise<EscribaFileResult>{
  const win=window.open('','_blank');if(!win)return {ok:false,error:'Permite abrir la ventana de impresión para continuar.'};
  win.opener=null;win.document.open();win.document.write(documentHtml(payload));win.document.close();
  await Promise.all([...win.document.images].map(image=>image.decode().catch(()=>undefined)));win.focus();win.print();
  return {ok:true,filePath:'Diálogo de impresión abierto. Elige Guardar como PDF o tu impresora.'};
}
export async function exportBrowserDocument(payload:EscribaDocumentPayload):Promise<EscribaFileResult>{
  try {
    const format=payload.format||'docx';if(format==='pdf')return await printBrowserDocument(payload);
    const name=Array.from(payload.title||'Documento').map(char=>char.charCodeAt(0)<32?'_':char).join('').replace(/[<>:"/\\|?*]/g,'_').slice(0,120)+'.'+format;
    let blob:Blob;
    if(format==='docx'){
      const {default:htmlToDocx}=await import('@turbodocx/html-to-docx');
      const dimension=payload.pageSize==='a4'?{width:11906,height:16838}:payload.pageSize==='legal'?{width:12240,height:20160}:{width:12240,height:15840};
      const output=await htmlToDocx(documentHtml(payload),null,{title:payload.title,orientation:payload.orientation,pageSize:dimension,margins:Object.fromEntries(Object.entries(payload.margins).map(([side,value])=>[side,Math.round(value*56.6929)]))});
      blob=output instanceof Blob?output:new Blob([new Uint8Array(output as ArrayBuffer)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    }else if(format==='odt'||format==='odf'){
      const zip=new JSZip();zip.file('mimetype','application/vnd.oasis.opendocument.text',{compression:'STORE'});
      zip.file('META-INF/manifest.xml','<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>');
      zip.file('content.xml',`<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text>${payload.text.split(/\r?\n/).map(line=>`<text:p>${escape(line)}</text:p>`).join('')}</office:text></office:body></office:document-content>`);
      blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.oasis.opendocument.text'});
    }else blob=new Blob([format==='txt'?payload.text:documentHtml(payload)],{type:format==='txt'?'text/plain;charset=utf-8':format==='doc'?'application/msword':'text/html;charset=utf-8'});
    download(blob,name);return {ok:true,filePath:name};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'No se pudo exportar.'};}
}
