import JSZip from 'jszip/dist/jszip';
import type { Product } from '../types';

export type ImportedProduct = Omit<Product, 'id'>;

type HeaderMap = {
  category?: number;
  cost?: number;
  name?: number;
  price?: number;
  stock?: number;
};

const categoryRules: Array<{ category: string; words: string[] }> = [
  {
    category: 'Alimentos',
    words: [
      'aguacate',
      'banana',
      'cebolla',
      'frijol',
      'fruta',
      'jitomate',
      'lechuga',
      'limon',
      'manzana',
      'naranja',
      'papa',
      'pera',
      'platano',
      'tomate',
      'verdura',
      'zanahoria',
    ],
  },
  {
    category: 'Refrescos',
    words: [
      '7up',
      'coca',
      'coca cola',
      'fanta',
      'fresca',
      'pepsi',
      'refresco',
      'sprite',
    ],
  },
  {
    category: 'Cerveza',
    words: [
      'cerveza',
      'corona',
      'heineken',
      'indio',
      'modelo',
      'tecate',
      'ultra',
      'victoria',
    ],
  },
  {
    category: 'Limpieza',
    words: [
      'cloro',
      'detergente',
      'escoba',
      'fabuloso',
      'jabon',
      'limpiador',
      'pinol',
      'suavitel',
      'trapeador',
    ],
  },
  {
    category: 'Papeleria',
    words: [
      'cuaderno',
      'folder',
      'lapiz',
      'marcador',
      'papel',
      'pluma',
      'regla',
      'tijera',
    ],
  },
  {
    category: 'Belleza',
    words: ['acondicionador', 'cepillo', 'crema', 'gel', 'shampoo', 'tinte'],
  },
  {
    category: 'Botanas',
    words: ['cacahuate', 'chocolate', 'galleta', 'paleta', 'sabrita', 'snack'],
  },
];

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function suggestCategory(productName: string) {
  const normalized = normalizeText(productName);
  const rule = categoryRules.find((candidate) =>
    candidate.words.some((word) => normalized.includes(word)),
  );
  return rule?.category || 'General';
}

function toNumber(value: unknown) {
  const cleaned = String(value ?? '')
    .replace(/[^0-9.,-]/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanCell(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cleanCell(current));
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(cleanCell(current));
  return cells;
}

function parseTextRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes(',')) {
        return parseCsvLine(line);
      }
      if (line.includes('\t')) {
        return line.split('\t').map(cleanCell);
      }
      if (line.includes('|')) {
        return line.split('|').map(cleanCell);
      }
      return [line];
    });
}

function headerIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header.includes(candidate)),
  );
}

function findHeaderMap(row: string[]): HeaderMap | null {
  const headers = row.map((cell) => normalizeText(cell));
  const name = headerIndex(headers, [
    'articulo',
    'descripcion',
    'nombre',
    'producto',
  ]);
  const price = headerIndex(headers, ['precio', 'venta', 'price']);
  const stock = headerIndex(headers, [
    'cantidad',
    'existencia',
    'stock',
    'unidades',
  ]);

  if (name === -1 || price === -1 || stock === -1) {
    return null;
  }

  const category = headerIndex(headers, ['categoria', 'category']);
  const cost = headerIndex(headers, ['costo', 'cost']);

  return {
    category: category === -1 ? undefined : category,
    cost: cost === -1 ? undefined : cost,
    name,
    price,
    stock,
  };
}

function productFromHeaderRow(row: string[], header: HeaderMap) {
  const name = cleanCell(row[header.name ?? -1]);
  const price = toNumber(row[header.price ?? -1]);
  const stock = Math.max(0, Math.round(toNumber(row[header.stock ?? -1])));
  const categoryCell =
    header.category === undefined ? '' : cleanCell(row[header.category]);
  const costCell = header.cost === undefined ? '' : row[header.cost];

  if (!name || price <= 0) {
    return null;
  }

  const cost = toNumber(costCell);
  return {
    category: categoryCell || suggestCategory(name),
    cost: cost > 0 ? cost : undefined,
    minStock: 3,
    name,
    price,
    stock,
  };
}

function productFromFreeText(text: string) {
  const matches = [...text.matchAll(/\$?\d+(?:[.,]\d+)?/g)];
  if (matches.length < 2) {
    return null;
  }

  const priceMatch = matches[matches.length - 2];
  const stockMatch = matches[matches.length - 1];
  const price = toNumber(priceMatch[0]);
  const stock = Math.max(0, Math.round(toNumber(stockMatch[0])));
  const name = `${text.slice(0, priceMatch.index)} ${text.slice(
    (stockMatch.index ?? 0) + stockMatch[0].length,
  )}`
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || price <= 0) {
    return null;
  }

  return {
    category: suggestCategory(name),
    minStock: 3,
    name,
    price,
    stock,
  };
}

function productFromRow(row: string[]) {
  const cells = row.map(cleanCell).filter(Boolean);
  if (cells.length >= 3) {
    const name = cells[0];
    const price = toNumber(cells[1]);
    const stock = Math.max(0, Math.round(toNumber(cells[2])));
    const cost = toNumber(cells[4] ?? '');
    if (name && price > 0) {
      return {
        category: cells[3] || suggestCategory(name),
        cost: cost > 0 ? cost : undefined,
        minStock: 3,
        name,
        price,
        stock,
      };
    }
  }

  return productFromFreeText(cells.join(' '));
}

function productsFromRows(rows: string[][]) {
  if (!rows.length) {
    return [];
  }

  const header = findHeaderMap(rows[0]);
  const productRows = header ? rows.slice(1) : rows;
  const products = productRows
    .map((row) => (header ? productFromHeaderRow(row, header) : productFromRow(row)))
    .filter(Boolean) as ImportedProduct[];
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = normalizeText(product.name);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function parseXml(text: string) {
  const Parser = (globalThis as any).DOMParser;
  if (!Parser) {
    throw new Error('Tu dispositivo no puede leer este archivo en este modo.');
  }
  return new Parser().parseFromString(text, 'application/xml') as Document;
}

function textNodes(parent: Element, localName: string) {
  return Array.from(parent.getElementsByTagNameNS('*', localName)).map(
    (node) => node.textContent || '',
  );
}

async function parseXlsx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedText = await zip.file('xl/sharedStrings.xml')?.async('text');
  const sharedStrings = sharedText
    ? Array.from(parseXml(sharedText).getElementsByTagNameNS('*', 'si')).map(
        (node) => textNodes(node as Element, 't').join(''),
      )
    : [];
  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ||
    zip
      .file(/xl\/worksheets\/sheet\d+\.xml/)
      .sort((left, right) => left.name.localeCompare(right.name))[0];

  if (!sheetFile) {
    return [];
  }

  const sheet = parseXml(await sheetFile.async('text'));
  const rows = Array.from(sheet.getElementsByTagNameNS('*', 'row')).map((row) =>
    Array.from((row as Element).getElementsByTagNameNS('*', 'c')).map((cell) => {
      const element = cell as Element;
      const type = element.getAttribute('t');
      const value =
        element.getElementsByTagNameNS('*', 'v')[0]?.textContent ||
        textNodes(element, 't').join('');
      if (type === 's') {
        return cleanCell(sharedStrings[Number(value)] || '');
      }
      return cleanCell(value);
    }),
  );

  return productsFromRows(rows);
}

async function parseDocx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    return [];
  }

  const documentXml = parseXml(await documentFile.async('text'));
  const paragraphs = Array.from(documentXml.getElementsByTagNameNS('*', 'p'))
    .map((paragraph) => textNodes(paragraph as Element, 't').join(' '))
    .map(cleanCell)
    .filter(Boolean);

  return productsFromRows(parseTextRows(paragraphs.join('\n')));
}

function readFile(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

export async function parseInventoryFile(file: File) {
  const buffer = await readFile(file);
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (extension === 'xlsx' || extension === 'xls') {
    return parseXlsx(buffer);
  }
  if (extension === 'docx' || extension === 'doc') {
    return parseDocx(buffer);
  }

  const text = new TextDecoder('utf-8').decode(buffer);
  return productsFromRows(parseTextRows(text));
}

export async function pickInventoryProducts() {
  const documentRef = (globalThis as any).document;
  if (!documentRef) {
    throw new Error('La importacion de archivos estara disponible en la app web.');
  }

  return new Promise<ImportedProduct[]>((resolve, reject) => {
    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.xlsx,.xls,.docx,.doc';
    input.onchange = async () => {
      const file = input.files?.[0] as File | undefined;
      if (!file) {
        reject(new Error('No se selecciono ningun archivo.'));
        return;
      }

      try {
        const products = await parseInventoryFile(file);
        if (!products.length) {
          reject(
            new Error(
              'No encontre productos claros. Usa columnas: producto, precio y cantidad.',
            ),
          );
          return;
        }
        resolve(products);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}
