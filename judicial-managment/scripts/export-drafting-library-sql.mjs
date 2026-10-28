import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourcePath = path.join(root, 'src', 'data', 'draftingExamples.ts');
const schemaPath = path.join(root, 'supabase', 'migrations', '20260622110000_legal_drafting_library.sql');
const outputPath = path.join(root, 'APLICAR_EN_SUPABASE_BIBLIOTECA_FORMATOS.sql');

const source = fs.readFileSync(sourcePath, 'utf8');
const schema = fs.readFileSync(schemaPath, 'utf8').trim();
const match = source.match(/export const draftingExamples: DraftingExample\[\] = (\[[\s\S]*\]);\s*$/);
if (!match) throw new Error('No se pudo leer la biblioteca local de formatos.');

const examples = JSON.parse(match[1]);
const sqlLiteral = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const jsonLiteral = (value) => `${sqlLiteral(JSON.stringify(value ?? {}))}::jsonb`;
const excerpt = (value) => {
  const text = String(value ?? '').trim();
  return text.length <= 1_500
    ? text
    : `${text.slice(0, 1_000)}\n\n[... estructura intermedia omitida ...]\n\n${text.slice(-420)}`;
};
const structure = (value) => [...new Set(String(value ?? '')
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/\s+/g, ' '))
  .filter((line) => line.length >= 3 && line.length <= 90)
  .filter((line) => /^(prestaciones|hechos|derecho|pruebas|alegatos|agravios|conceptos de violacion|conceptos de violación|puntos petitorios|petitorios|protesto|excepciones|defensas|clausulas|cláusulas|antecedentes|suspension|suspensión|autoridad responsable|acto reclamado)/i.test(line)
    || (line === line.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line))))].slice(0, 12);

const values = examples.map((example) => `(
  ${sqlLiteral(example.id)},
  ${sqlLiteral(example.title)},
  ${sqlLiteral(example.kind)},
  ${sqlLiteral(example.matter)},
  ${jsonLiteral(example.keywords)},
  ${jsonLiteral(structure(example.sampleText))},
  ${sqlLiteral(excerpt(example.sampleText))},
  ${sqlLiteral(example.sanitizedDocx)},
  ${jsonLiteral(example.redactionCounts)}
)`).join(',\n');

const sql = `-- Biblioteca generada desde ejemplos sanitizados. No contiene datos personales originales.\n\n${schema}\n\ninsert into public.legal_drafting_examples (\n  id, title, kind, matter, keywords, structure, source_excerpt, sanitized_docx_path, redaction_counts\n) values\n${values}\non conflict (id) do update set\n  title = excluded.title,\n  kind = excluded.kind,\n  matter = excluded.matter,\n  keywords = excluded.keywords,\n  structure = excluded.structure,\n  source_excerpt = excluded.source_excerpt,\n  sanitized_docx_path = excluded.sanitized_docx_path,\n  redaction_counts = excluded.redaction_counts,\n  is_active = true,\n  library_version = public.legal_drafting_examples.library_version + 1,\n  updated_at = now();\n`;

fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`Biblioteca SQL generada: ${examples.length} formatos en ${outputPath}`);
