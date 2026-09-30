import { PDFDocument, rgb } from "pdf-lib";
import { openPdf } from "./pdf-raster";

const AMOUNT = String.raw`\d{1,3}(?:[ \u00a0.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}`;
const CURRENCY = String.raw`€|\$|£|\b(?:EUR|USD|GBP|CHF|CAD|AUD)\b`;
const LABEL = String.raw`total|sous-total|subtotal|net|tarif|rate|prix|amount|fare|taxe|tax|montant|ttc|ht`;

const PAIR = new RegExp(`(${CURRENCY})\\s*(${AMOUNT})|(${AMOUNT})\\s*(${CURRENCY})`, "gi");
const LABELED = new RegExp(`(?:${LABEL})\\s*:?\\s*(${AMOUNT})(?:\\s*(${CURRENCY}))?`, "gi");

export const HIDE_PRICE_REQUIRED = "Indiquez si le prix doit être caché sur le PDF.";
export const HIDE_PRICE_FAILED = "Le prix n’a pas pu être masqué sur ce fichier.";

export class PriceRedactError extends Error {
  constructor(message = HIDE_PRICE_FAILED) {
    super(message);
    this.name = "PriceRedactError";
  }
}

/** true / false, ou undefined si l’agent n’a pas répondu. */
export function readHidePricesChoice(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

export function documentPriceDecided(hidePrices: boolean | null | undefined) {
  return hidePrices === true || hidePrices === false;
}

type Span = [number, number];

function looksLikeDate(line: string, start: number, end: number) {
  const slice = line.slice(Math.max(0, start - 8), Math.min(line.length, end + 8));
  return /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(slice);
}

function pushSpan(spans: Span[], start: number, end: number, line: string) {
  if (end <= start) return;
  if (looksLikeDate(line, start, end)) return;
  spans.push([start, end]);
}

function groupOffset(match: RegExpExecArray, text: string | undefined) {
  if (!text) return null;
  const at = match[0].indexOf(text);
  if (at < 0) return null;
  return match.index + at;
}

/** Plages à couvrir sur une ligne déjà assemblée. Le libellé (Total, NET) reste. */
export function priceCoverSpans(line: string): Span[] {
  const spans: Span[] = [];
  PAIR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PAIR.exec(line))) {
    pushSpan(spans, match.index, match.index + match[0].length, line);
  }
  LABELED.lastIndex = 0;
  while ((match = LABELED.exec(line))) {
    const amountAt = groupOffset(match, match[1]);
    if (amountAt == null || !match[1]) continue;
    const amountEnd = amountAt + match[1].length;
    pushSpan(spans, amountAt, amountEnd, line);
    const currencyAt = groupOffset(match, match[2]);
    if (currencyAt != null && match[2]) pushSpan(spans, currencyAt, currencyAt + match[2].length, line);
  }
  return spans;
}

export type PdfGlyph = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PriceBox = { pageIndex: number; x: number; y: number; width: number; height: number };

function groupLines(glyphs: PdfGlyph[]) {
  const sorted = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfGlyph[][] = [];
  for (const glyph of sorted) {
    const line = lines.find(
      (rows) => Math.abs(rows[0].y - glyph.y) <= Math.max(2, Math.min(rows[0].height, glyph.height) * 0.45)
    );
    if (line) line.push(glyph);
    else lines.push([glyph]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function linePieces(line: PdfGlyph[]) {
  let cursor = 0;
  const pieces: { glyph: PdfGlyph; start: number; end: number }[] = [];
  line.forEach((glyph, index) => {
    if (index > 0) cursor += 1;
    const start = cursor;
    cursor += glyph.str.length;
    pieces.push({ glyph, start, end: cursor });
  });
  const text = pieces.map((piece) => piece.glyph.str).join(" ");
  return { text, pieces };
}

function overlaps(start: number, end: number, spans: Span[]) {
  return spans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart);
}

function glyphBox(glyph: PdfGlyph): Omit<PriceBox, "pageIndex"> {
  const pad = 1.25;
  const height = Math.max(glyph.height, 8);
  return {
    x: glyph.x - pad,
    y: glyph.y - height * 0.28 - pad,
    width: Math.max(glyph.width, height * 0.45) + pad * 2,
    height: height * 1.35 + pad,
  };
}

export async function readPdfGlyphs(bytes: Uint8Array): Promise<PdfGlyph[][]> {
  const pdf = await openPdf(bytes);
  const pages: PdfGlyph[][] = [];
  const total = pdf.numPages || 1;
  for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const glyphs: PdfGlyph[] = [];
    for (const item of content.items) {
      if (!item || typeof item !== "object" || !("str" in item)) continue;
      const row = item as { str?: string; transform?: number[]; width?: number; height?: number };
      const str = row.str || "";
      if (!str.trim()) continue;
      const transform = row.transform || [];
      const fontSize = Math.abs(transform[3] || row.height || 0) || row.height || 10;
      glyphs.push({
        str,
        x: transform[4] || 0,
        y: transform[5] || 0,
        width: row.width && row.width > 0 ? row.width : str.length * fontSize * 0.5,
        height: fontSize,
      });
    }
    pages.push(glyphs);
  }
  return pages;
}

function boxesOnPage(glyphs: PdfGlyph[], pageIndex: number): PriceBox[] {
  const boxes: PriceBox[] = [];
  for (const line of groupLines(glyphs)) {
    const { text, pieces } = linePieces(line);
    const spans = priceCoverSpans(text);
    if (!spans.length) continue;
    for (const piece of pieces) {
      if (!overlaps(piece.start, piece.end, spans)) continue;
      boxes.push({ pageIndex, ...glyphBox(piece.glyph) });
    }
  }
  return boxes;
}

export type PriceRedactResult =
  | { ok: true; changed: boolean; bytes: Uint8Array }
  | { ok: false; reason: "no-text" };

/** Part du bas retirée quand les montants ne peuvent pas être effacés (photo ou scan). */
export const PRICE_TRUNCATE_RATIO = 0.3;

/** Garde le haut de chaque page. Le bas, où se trouve souvent le total, est coupé. */
export async function truncatePdfBottom(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const pages = src.getPages();
  if (!pages.length) throw new PriceRedactError();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const cut = height * PRICE_TRUNCATE_RATIO;
    const keep = height - cut;
    if (keep < 48) throw new PriceRedactError();
    const embedded = await out.embedPage(page, {
      left: 0,
      bottom: cut,
      right: width,
      top: height,
    });
    const next = out.addPage([embedded.width, embedded.height]);
    next.drawPage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    });
  }
  return new Uint8Array(await out.save());
}

/** Coupe le bas d’une photo. Le fichier renvoyé est plus court. */
export async function truncateImageBottom(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; mime: string }> {
  const sharp = (await import("sharp")).default;
  const upright = await sharp(bytes).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 2 || height < 8) throw new PriceRedactError();
  const keep = Math.max(1, Math.round(height * (1 - PRICE_TRUNCATE_RATIO)));
  const format = meta.format === "png" ? "png" : meta.format === "webp" ? "webp" : "jpeg";
  const pipeline = sharp(upright).extract({ left: 0, top: 0, width, height: keep });
  const encoded =
    format === "png"
      ? await pipeline.png().toBuffer()
      : format === "webp"
        ? await pipeline.webp().toBuffer()
        : await pipeline.jpeg({ quality: 85 }).toBuffer();
  const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  return { bytes: new Uint8Array(encoded), mime };
}

/** Couvre les montants imprimés. Un PDF sans calque texte ne peut pas être masqué. */
export async function redactPdfPrices(bytes: Uint8Array): Promise<PriceRedactResult> {
  const pages = await readPdfGlyphs(bytes);
  const text = pages
    .flat()
    .map((glyph) => glyph.str)
    .join("")
    .replace(/\s+/g, "");
  if (text.length < 8) return { ok: false, reason: "no-text" };

  const boxes = pages.flatMap((glyphs, pageIndex) => boxesOnPage(glyphs, pageIndex));
  if (!boxes.length) return { ok: true, changed: false, bytes };

  const doc = await PDFDocument.load(bytes);
  const pdfPages = doc.getPages();
  for (const box of boxes) {
    const page = pdfPages[box.pageIndex];
    if (!page) continue;
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      color: rgb(1, 1, 1),
      borderWidth: 0,
      opacity: 1,
    });
  }
  return { ok: true, changed: true, bytes: new Uint8Array(await doc.save()) };
}
