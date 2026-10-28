import { createHash } from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import postgres from 'postgres';

const SUPABASE_DB_HOST = process.env.SUPABASE_DB_HOST;
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const SUPABASE_DB_USER = process.env.SUPABASE_DB_USER ?? 'postgres';
const SUPABASE_DB_NAME = process.env.SUPABASE_DB_NAME ?? 'postgres';
const SOURCE_SLUG = process.argv.find((argument) => argument.startsWith('--source='))
  ?.slice('--source='.length);
const MAX_CHUNK_CHARACTERS = 6_000;
const verifiedPortalReformDates = new Map([
  ['codigo-penal-coahuila', '2025-04-22'],
]);

if (!SUPABASE_DB_HOST || !SUPABASE_DB_PASSWORD) {
  throw new Error('Define SUPABASE_DB_HOST y SUPABASE_DB_PASSWORD para cargar la biblioteca juridica.');
}

const sql = postgres({
  host: SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT ?? 5432),
  database: SUPABASE_DB_NAME,
  username: SUPABASE_DB_USER,
  password: SUPABASE_DB_PASSWORD,
  ssl: 'require',
  max: 1,
  connect_timeout: 20,
});

const allowedOfficialHost = (rawUrl) => {
  const host = new URL(rawUrl).hostname.toLowerCase();
  return host === 'www.diputados.gob.mx'
    || host === 'diputados.gob.mx'
    || host === 'www.congresocoahuila.gob.mx'
    || host === 'congresocoahuila.gob.mx';
};

const normalizeText = (value) => value
  .replace(/\u0000/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*\n\s*/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const spanishMonths = new Map([
  ['enero', 1],
  ['febrero', 2],
  ['marzo', 3],
  ['abril', 4],
  ['mayo', 5],
  ['junio', 6],
  ['julio', 7],
  ['agosto', 8],
  ['septiembre', 9],
  ['setiembre', 9],
  ['octubre', 10],
  ['noviembre', 11],
  ['diciembre', 12],
]);

const toIsoDate = (day, month, year) => {
  const parsedDay = Number(day);
  const parsedMonth = Number(month);
  const parsedYear = Number(year);
  if (
    parsedYear < 1800
    || parsedYear > 2200
    || parsedMonth < 1
    || parsedMonth > 12
    || parsedDay < 1
    || parsedDay > 31
  ) return null;

  return `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(parsedDay).padStart(2, '0')}`;
};

const detectLastReformDate = (pages) => {
  const firstPages = pages.slice(0, 6).map((page) => page.text).join(' ');
  const normalized = firstPages
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX');
  const reformIndex = normalized.search(/ultimas?\s+(?:reformas?|modificaciones?)/);
  if (reformIndex < 0) return null;

  const reformText = normalized.slice(reformIndex, reformIndex + 900);
  const numericMatch = reformText.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (numericMatch) return toIsoDate(numericMatch[1], numericMatch[2], numericMatch[3]);

  const namedMonthMatch = reformText.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/,
  );
  if (!namedMonthMatch) return null;

  return toIsoDate(
    namedMonthMatch[1],
    spanishMonths.get(namedMonthMatch[2]),
    namedMonthMatch[3],
  );
};

const extractPdfPages = async (bytes) => {
  const document = await pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = normalizeText(textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' '));
    pages.push({ pageNumber, text });
  }

  return pages;
};

const articlePattern = /\b(?:ART[IÍ]CULO|Art[ií]culo)\s+([0-9]+(?:\s*(?:Bis|Ter|Qu[aá]ter))?|[A-ZÁÉÍÓÚÑ]+)\s*[.\-º°]*/gu;

const splitLongText = (text, maximum = MAX_CHUNK_CHARACTERS) => {
  if (text.length <= maximum) return [text];
  const paragraphs = text.split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/u);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > maximum) {
      chunks.push(current.trim());
      current = '';
    }
    current += `${current ? ' ' : ''}${paragraph}`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

const pagesToChunks = (source, pages) => {
  const fullText = pages
    .map((page) => `\n[[PAGE:${page.pageNumber}]]\n${page.text}`)
    .join('\n');
  const matches = [...fullText.matchAll(articlePattern)];
  const sections = [];

  if (matches.length === 0) {
    sections.push({
      articleReference: null,
      text: fullText,
      startIndex: 0,
    });
  } else {
    if (matches[0].index > 0) {
      sections.push({
        articleReference: 'Preliminares',
        text: fullText.slice(0, matches[0].index),
        startIndex: 0,
      });
    }

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      sections.push({
        articleReference: `Articulo ${match[1]}`,
        text: fullText.slice(match.index, matches[index + 1]?.index ?? fullText.length),
        startIndex: match.index,
      });
    }
  }

  let chunkIndex = 0;
  return sections.flatMap((section) => {
    const pageMarkers = [...section.text.matchAll(/\[\[PAGE:(\d+)\]\]/g)]
      .map((match) => Number(match[1]));
    const content = normalizeText(section.text.replace(/\[\[PAGE:\d+\]\]/g, ''));
    if (!content) return [];

    return splitLongText(content).map((part, partIndex) => {
      const suffix = partIndex > 0 ? `, parte ${partIndex + 1}` : '';
      const articleReference = section.articleReference
        ? `${section.articleReference}${suffix}`
        : null;
      const citationLabel = articleReference
        ? `${source.short_name}, ${articleReference}`
        : `${source.short_name}, texto preliminar`;

      const chunk = {
        source_id: source.id,
        chunk_index: chunkIndex,
        article_reference: articleReference,
        heading: null,
        content: part,
        page_start: pageMarkers[0] ?? null,
        page_end: pageMarkers.at(-1) ?? null,
        citation_label: citationLabel,
      };
      chunkIndex += 1;
      return chunk;
    });
  });
};

const ingestSource = async (source) => {
  if (!allowedOfficialHost(source.official_document_url)) {
    throw new Error(`Fuente no autorizada para ${source.slug}.`);
  }

  console.log(`Descargando ${source.short_name}...`);
  const response = await fetch(source.official_document_url);
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${source.slug}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const [existingVersion] = await sql`
    select id, ingestion_status
    from public.legal_source_versions
    where source_id = ${source.id}
      and sha256 = ${sha256}
    limit 1
  `;
  const pages = await extractPdfPages(bytes);
  const lastReformDate = detectLastReformDate(pages)
    ?? verifiedPortalReformDates.get(source.slug)
    ?? null;
  if (existingVersion?.ingestion_status === 'ready') {
    await sql`
      update public.legal_source_versions
      set
        last_reform_date = ${lastReformDate},
        page_count = ${pages.length},
        file_size = ${bytes.byteLength}
      where id = ${existingVersion.id}
    `;
    console.log(`${source.short_name}: la version actual ya esta cargada.`);
    return;
  }

  const chunks = pagesToChunks(source, pages);
  if (chunks.length === 0) throw new Error(`No se pudo extraer texto de ${source.slug}.`);

  await sql.begin(async (transaction) => {
    await transaction`
      update public.legal_source_versions
      set is_current = false
      where source_id = ${source.id}
        and is_current
    `;

    const versionLabel = `Descarga oficial ${new Date().toISOString().slice(0, 10)}`;
    const [version] = existingVersion
      ? await transaction`
          update public.legal_source_versions
          set
            version_label = ${versionLabel},
            official_document_url = ${source.official_document_url},
            last_reform_date = ${lastReformDate},
            file_size = ${bytes.byteLength},
            page_count = ${pages.length},
            is_current = true,
            ingestion_status = 'processing',
            ingestion_error = null
          where id = ${existingVersion.id}
          returning id
        `
      : await transaction`
          insert into public.legal_source_versions (
            source_id,
            version_label,
            official_document_url,
            last_reform_date,
            sha256,
            file_size,
            page_count,
            is_current,
            ingestion_status
          )
          values (
            ${source.id},
            ${versionLabel},
            ${source.official_document_url},
            ${lastReformDate},
            ${sha256},
            ${bytes.byteLength},
            ${pages.length},
            true,
            'processing'
          )
          returning id
        `;

    await transaction`
      delete from public.legal_chunks where version_id = ${version.id}
    `;

    const batchSize = 200;
    const columns = [
      'source_id',
      'version_id',
      'chunk_index',
      'article_reference',
      'heading',
      'content',
      'page_start',
      'page_end',
      'citation_label',
    ];
    for (let index = 0; index < chunks.length; index += batchSize) {
      const batch = chunks.slice(index, index + batchSize)
        .map((chunk) => ({ ...chunk, version_id: version.id }));
      await transaction`
        insert into public.legal_chunks ${transaction(batch, ...columns)}
      `;
    }

    await transaction`
      update public.legal_source_versions
      set
        ingestion_status = 'ready',
        ingestion_error = null,
        ingested_at = now()
      where id = ${version.id}
    `;
  });

  console.log(`${source.short_name}: ${chunks.length} fragmentos cargados.`);
};

const sources = await sql`
  select id, slug, short_name, official_document_url
  from public.legal_sources
  where status in ('vigente', 'transitorio')
  order by jurisdiction, short_name
`;

const selectedSources = SOURCE_SLUG
  ? sources.filter((source) => source.slug === SOURCE_SLUG)
  : sources;
if (SOURCE_SLUG && selectedSources.length === 0) {
  throw new Error(`No existe la fuente "${SOURCE_SLUG}".`);
}

for (const source of selectedSources) {
  try {
    await ingestSource(source);
  } catch (error) {
    console.error(`${source.short_name}:`, error);
  }
}

await sql.end({ timeout: 5 });
