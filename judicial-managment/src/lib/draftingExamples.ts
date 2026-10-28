import { draftingExamples, type DraftingExample } from '../data/draftingExamples';

export interface DraftingExampleMatch {
  id: string;
  title: string;
  kind: string;
  matter: string;
  keywords: string[];
  sanitizedDocx: string;
  score: number;
  selectionReason: string;
  structure: string[];
  excerpt: string;
  source: 'private' | 'platform';
  sourcePriority: number;
}

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-MX');

const tokenize = (value: string) => normalizeSearchText(value)
  .split(/[^a-z0-9]+/)
  .filter((term) => term.length >= 4);

const countMatches = (haystack: string, terms: string[]) => terms.reduce(
  (score, term) => score + (haystack.includes(term) ? 1 : 0),
  0,
);

const draftingAliases: Record<string, string[]> = {
  apelacion: ['apelacion', 'apelación', 'recurso', 'agravio'],
  amparo: ['amparo', 'queja', 'revision', 'revisión'],
  contestacion: ['contestacion', 'contestación', 'defensa', 'excepciones'],
  demanda: ['demanda', 'inicial', 'prestaciones'],
  alegatos: ['alegatos', 'conclusiones'],
  promocion: ['promocion', 'promoción', 'ocurso', 'solicitud'],
  incidente: ['incidente', 'nulidad'],
  recurso: ['recurso', 'apelacion', 'apelación', 'queja', 'revision', 'revisión'],
};

const getDraftingTerms = (value: string) => {
  const normalized = normalizeSearchText(value);
  return Object.entries(draftingAliases)
    .filter(([intent, aliases]) => normalized.includes(intent) || aliases.some((alias) => normalized.includes(alias)))
    .flatMap(([, aliases]) => aliases)
    .map(normalizeSearchText);
};

const getStructure = (sampleText: string) => {
  const candidates = sampleText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length >= 3 && line.length <= 90)
    .filter((line) => (
      /^(prestaciones|hechos|derecho|pruebas|alegatos|agravios|conceptos de violacion|conceptos de violación|puntos petitorios|petitorios|protesto|excepciones|defensas|clausulas|cláusulas|antecedentes|suspension|suspensión|autoridad responsable|acto reclamado)/i.test(line)
      || (line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line))
    ));

  return [...new Set(candidates)].slice(0, 12);
};

const getExcerpt = (sampleText: string) => {
  const compact = sampleText.trim();
  if (compact.length <= 1_500) return compact;
  return `${compact.slice(0, 1_000)}\n\n[... estructura intermedia omitida ...]\n\n${compact.slice(-420)}`;
};

const scoreExample = (example: DraftingExample, query: string, matter?: string) => {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedMatter = normalizeSearchText(matter ?? '');
  const normalizedKind = normalizeSearchText(example.kind);
  const normalizedExampleMatter = normalizeSearchText(example.matter);
  const keywordText = normalizeSearchText(example.keywords.join(' '));
  const sampleText = normalizeSearchText(example.sampleText.slice(0, 2_500));
  const queryTerms = tokenize(query);
  const draftingTerms = getDraftingTerms(query);

  let score = 0;
  if (normalizedQuery.includes(normalizedKind) || normalizedKind.includes(normalizedQuery)) score += 8;
  if (normalizedMatter && normalizedMatter === normalizedExampleMatter) score += 6;
  score += countMatches(normalizedKind, draftingTerms) * 9;
  score += countMatches(keywordText, queryTerms) * 3;
  score += Math.min(5, countMatches(sampleText, queryTerms));
  return score;
};

export const findDraftingExamples = ({
  documentType,
  subject,
  matter,
  limit = 3,
}: {
  documentType: string;
  subject?: string;
  matter?: string;
  limit?: number;
}): DraftingExampleMatch[] => {
  const query = [documentType, subject, matter].filter(Boolean).join(' ');
  const matches = draftingExamples
    .map((example) => ({
      example,
      score: scoreExample(example, query, matter),
    }))
    .sort((left, right) => right.score - left.score || left.example.title.localeCompare(right.example.title, 'es-MX'));

  const selected = matches
    .filter((match) => match.score > 0)
    .slice(0, Math.max(1, Math.min(limit, 5)));

  return selected.map(({ example, score }) => ({
    id: example.id,
    title: example.title,
    kind: example.kind,
    matter: example.matter,
    keywords: example.keywords,
    sanitizedDocx: example.sanitizedDocx,
    score,
    selectionReason: score > 0
      ? `Coincide con el tipo de escrito y la materia solicitados (${example.kind}, ${example.matter}).`
      : `Referencia disponible para ${example.kind} en materia ${example.matter}.`,
    structure: getStructure(example.sampleText),
    excerpt: getExcerpt(example.sampleText),
    source: 'platform',
    sourcePriority: 100,
  }));
};

export const getDraftingExampleCount = () => draftingExamples.length;
