// Reads a merchant's product list from CSV. Plain code, no AI: prices must be exact.

export type ProductDraft = {
  name: string;
  category: string;
  priceCents: number;
  description: string;
  inStock: boolean;
};

export type CsvResult = { products: ProductDraft[]; skipped: string[] };

const HEADER_ALIASES: Record<keyof Omit<ProductDraft, 'priceCents' | 'inStock'> | 'price' | 'stock', string[]> = {
  name: ['name', 'title', 'product', 'item', 'product name'],
  price: ['price', 'amount', 'cost', 'price usd', 'price (usd)', 'unit price'],
  category: ['category', 'type', 'collection', 'section'],
  description: ['description', 'desc', 'details', 'notes'],
  stock: ['in stock', 'in_stock', 'stock', 'available'],
};

export const MAX_PRODUCTS = 200;

function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Split CSV text into rows of cells. Handles quoted cells, doubled quotes and newlines inside quotes. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/** "$1,200.50" → 120050. Returns null when the text is not a usable price. */
export function parsePriceToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 10_000_00 ? cents : null;
}

const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** True when the first line names a product column and a price column. */
export function looksLikeCsv(text: string): boolean {
  const first = text.trim().split(/\r?\n/)[0] ?? '';
  const headers = first.split(detectDelimiter(first)).map((h) => normalizeHeader(h.replace(/"/g, '')));
  return headers.some((h) => HEADER_ALIASES.name.includes(h)) && headers.some((h) => HEADER_ALIASES.price.includes(h));
}

export function parseProductsCsv(text: string): CsvResult {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return { products: [], skipped: [] };
  const delimiter = detectDelimiter(trimmed.split(/\r?\n/)[0]);
  const [header, ...rows] = parseCsvRows(trimmed, delimiter);
  const headers = header.map(normalizeHeader);
  const col = (key: keyof typeof HEADER_ALIASES): number => headers.findIndex((h) => HEADER_ALIASES[key].includes(h));
  const idx = { name: col('name'), price: col('price'), category: col('category'), description: col('description'), stock: col('stock') };
  if (idx.name < 0 || idx.price < 0) {
    return { products: [], skipped: ['The first line must name the columns, and include at least "name" and "price".'] };
  }

  const products: ProductDraft[] = [];
  const skipped: string[] = [];
  rows.forEach((cells, i) => {
    const line = i + 2;
    const name = (cells[idx.name] ?? '').slice(0, 120);
    const priceCents = parsePriceToCents(cells[idx.price] ?? '');
    if (!name) return void skipped.push(`Line ${line}: no product name.`);
    if (priceCents === null) return void skipped.push(`Line ${line} (${name}): "${cells[idx.price] ?? ''}" is not a price.`);
    if (products.length >= MAX_PRODUCTS) return void skipped.push(`Line ${line} (${name}): over the ${MAX_PRODUCTS} product limit.`);
    const stock = idx.stock >= 0 ? (cells[idx.stock] ?? '').toLowerCase() : '';
    products.push({
      name,
      priceCents,
      category: (idx.category >= 0 ? cells[idx.category] : '')?.toLowerCase().slice(0, 40) || 'general',
      description: (idx.description >= 0 ? cells[idx.description] : '')?.slice(0, 500) ?? '',
      inStock: !['no', 'false', '0', 'out', 'out of stock', 'n'].includes(stock),
    });
  });
  return { products, skipped };
}
