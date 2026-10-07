import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { siteConfig } from "@/lib/site";
import { loadBrandLogoPng } from "./brand-logo";
import type { StatementModel, StatementRow, StatementSection, StatementStay, StatementSummary } from "./statement";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const FOOTER_TOP = 86;
const NAVY = rgb(0x0b / 255, 0x19 / 255, 0x2c / 255);
const GOLD = rgb(0xc5 / 255, 0xa8 / 255, 0x80 / 255);
const CREAM = rgb(0xfa / 255, 0xf9 / 255, 0xf6 / 255);
const MUTED = rgb(0x5c / 255, 0x65 / 255, 0x70 / 255);
const INK = rgb(0x0b / 255, 0x19 / 255, 0x2c / 255);
const WHITE = rgb(1, 1, 1);

/** Helvetica (WinAnsi) : euros, apostrophes typographiques et espaces fines retirés. */
export function pdfSafe(font: PDFFont, value: string) {
  const cleaned = value
    .normalize("NFC")
    .replace(/[\u202f\u00a0\u2009]/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/€/g, "EUR");
  let out = "";
  for (const char of cleaned) {
    try {
      font.encodeText(char);
      out += char;
    } catch {
      if (char.trim()) out += " ";
    }
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const source = pdfSafe(font, value);
  if (!source) return [];
  const words = source.split(" ");
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      lines.push(word);
      return;
    }
    let chunk = "";
    for (const char of word) {
      const next = chunk + char;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next;
      else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    if (chunk) lines.push(chunk);
  };
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = "";
      pushWord(word);
    }
  }
  if (current) lines.push(current);
  return lines;
}

type Draw = {
  doc: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  title: string;
  /** Badge TBA ; absent, l’en-tête retombe sur le monogramme tracé. */
  logo: PDFImage | null;
};

function contentBottom() {
  return FOOTER_TOP + 16;
}

function drawTracked(page: PDFPage, font: PDFFont, value: string, x: number, baseline: number, size: number, tracking: number, color: ReturnType<typeof rgb>) {
  let cursor = x;
  for (const char of value) {
    page.drawText(char, { x: cursor, y: baseline, size, font, color });
    cursor += font.widthOfTextAtSize(char, size) + tracking;
  }
}

function paintFooter(page: PDFPage, font: PDFFont) {
  page.drawRectangle({ x: 0, y: FOOTER_TOP, width: PAGE_W, height: 1.5, color: GOLD });
  const lines = [
    `${siteConfig.legal.legalName} · SASU au capital de 20 000 EUR · SIRET ${siteConfig.legal.siret}`,
    `${siteConfig.legal.rcs} · TVA ${siteConfig.legal.vat} · ${siteConfig.address.full}`,
    `${siteConfig.phoneDisplay} · ${siteConfig.contactEmail}`,
    "Garantie financière : APST, 15 avenue Carnot, 75017 Paris.",
    "Ce relevé reprend les mouvements comptabilisés à la date d'édition. Ce n'est pas une facture.",
  ];
  let baseline = 70;
  for (const line of lines) {
    const safe = pdfSafe(font, line);
    page.drawText(safe, { x: MARGIN, y: baseline, size: 7, font, color: MUTED });
    baseline -= 10;
  }
}

function paintHeader(draw: Draw, continued: boolean) {
  const { page, bold, regular } = draw;
  if (!continued) {
    page.drawRectangle({ x: 0, y: PAGE_H - 108, width: PAGE_W, height: 108, color: NAVY });
    page.drawRectangle({ x: 0, y: PAGE_H - 112, width: PAGE_W, height: 4, color: GOLD });
    if (draw.logo) {
      page.drawImage(draw.logo, { x: MARGIN - 2, y: PAGE_H - 80, width: 40, height: 40 });
    } else {
      page.drawRectangle({
        x: MARGIN,
        y: PAGE_H - 78,
        width: 36,
        height: 36,
        borderColor: GOLD,
        borderWidth: 1,
      });
      const mark = "TBA";
      const markWidth = bold.widthOfTextAtSize(mark, 9);
      page.drawText(mark, {
        x: MARGIN + (36 - markWidth) / 2,
        y: PAGE_H - 62,
        size: 9,
        font: bold,
        color: GOLD,
      });
    }
    drawTracked(page, bold, "TRAVEL BUSINESS AGENCY", MARGIN + 48, PAGE_H - 58, 9, 0.6, GOLD);
    page.drawText("Agence de voyage", {
      x: MARGIN + 48,
      y: PAGE_H - 74,
      size: 8,
      font: regular,
      color: WHITE,
    });
    const heading = pdfSafe(bold, draw.title.toUpperCase());
    const headingWidth = bold.widthOfTextAtSize(heading, 14);
    page.drawText(heading, {
      x: PAGE_W - MARGIN - headingWidth,
      y: PAGE_H - 62,
      size: 14,
      font: bold,
      color: WHITE,
    });
    draw.y = PAGE_H - 136;
    return;
  }
  page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_H - 39, width: PAGE_W, height: 3, color: GOLD });
  page.drawText("TRAVEL BUSINESS AGENCY", {
    x: MARGIN,
    y: PAGE_H - 24,
    size: 8,
    font: bold,
    color: GOLD,
  });
  const heading = pdfSafe(regular, draw.title);
  const headingWidth = regular.widthOfTextAtSize(heading, 9);
  page.drawText(heading, {
    x: PAGE_W - MARGIN - headingWidth,
    y: PAGE_H - 24,
    size: 9,
    font: regular,
    color: WHITE,
  });
  draw.y = PAGE_H - 58;
}

function openPage(draw: Draw, continued: boolean) {
  const page = draw.doc.addPage([PAGE_W, PAGE_H]);
  draw.page = page;
  draw.pages.push(page);
  paintHeader(draw, continued);
  paintFooter(page, draw.regular);
}

function ensure(draw: Draw, height: number) {
  if (draw.y - height >= contentBottom()) return;
  openPage(draw, true);
}

function drawRight(draw: Draw, value: string, right: number, baseline: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const safe = pdfSafe(font, value);
  if (!safe) return;
  const width = font.widthOfTextAtSize(safe, size);
  draw.page.drawText(safe, { x: right - width, y: baseline, size, font, color });
}

function drawLine(draw: Draw, value: string, x: number, baseline: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const safe = pdfSafe(font, value);
  if (!safe) return;
  draw.page.drawText(safe, { x, y: baseline, size, font, color });
}

function blockHeight(lines: number, size: number, gap: number) {
  if (!lines) return 0;
  return lines * (size + gap);
}

function drawIdentity(draw: Draw, model: StatementModel) {
  const leftWidth = 330;
  const nameLines = wrap(draw.bold, model.holderName, 16, leftWidth);
  const detailLines = model.holderLines.flatMap((line) => wrap(draw.regular, line, 9, leftWidth));
  const height = 16 + blockHeight(nameLines.length, 16, 3) + blockHeight(detailLines.length, 9, 3) + 18;
  ensure(draw, height);
  drawLine(draw, "Titulaire", MARGIN, draw.y - 9, 8, draw.bold, GOLD);
  drawRight(draw, "Établi le", PAGE_W - MARGIN, draw.y - 9, 8, draw.bold, GOLD);
  let baseline = draw.y - 28;
  for (const line of nameLines) {
    drawLine(draw, line, MARGIN, baseline, 16, draw.bold, INK);
    baseline -= 19;
  }
  const issuedBaseline = draw.y - 26;
  drawRight(draw, model.issuedOn, PAGE_W - MARGIN, issuedBaseline, 10, draw.regular, INK);
  drawRight(draw, `N° ${model.number}`, PAGE_W - MARGIN, issuedBaseline - 14, 9, draw.regular, MUTED);
  for (const line of detailLines) {
    drawLine(draw, line, MARGIN, baseline, 9, draw.regular, MUTED);
    baseline -= 12;
  }
  draw.y = Math.min(baseline, issuedBaseline - 28) - 8;
  draw.page.drawRectangle({ x: MARGIN, y: draw.y, width: PAGE_W - MARGIN * 2, height: 1, color: GOLD });
  draw.y -= 18;
}

function fitted(font: PDFFont, value: string, maxWidth: number, preferred: number) {
  const safe = pdfSafe(font, value);
  let size = preferred;
  while (size > 7 && font.widthOfTextAtSize(safe, size) > maxWidth) size -= 0.5;
  return { safe, size };
}

function drawSummaries(draw: Draw, items: StatementSummary[]) {
  const gap = 8;
  for (let index = 0; index < items.length; index += 3) {
    const row = items.slice(index, index + 3);
    const boxW = (PAGE_W - MARGIN * 2 - gap * (row.length - 1)) / row.length;
    ensure(draw, 64);
    row.forEach((item, column) => {
      const x = MARGIN + column * (boxW + gap);
      const inner = boxW - 20;
      draw.page.drawRectangle({ x, y: draw.y - 56, width: boxW, height: 56, color: CREAM });
      draw.page.drawRectangle({ x, y: draw.y - 2, width: boxW, height: 2, color: GOLD });
      const label = fitted(draw.bold, item.label.toUpperCase(), inner, 7);
      draw.page.drawText(label.safe, { x: x + 10, y: draw.y - 16, size: label.size, font: draw.bold, color: GOLD });
      const value = fitted(draw.bold, item.value, inner, 12);
      if (value.safe) {
        draw.page.drawText(value.safe, { x: x + 10, y: draw.y - 34, size: value.size, font: draw.bold, color: INK });
      }
      if (item.hint) {
        const hint = wrap(draw.regular, item.hint, 7, inner)[0];
        if (hint) draw.page.drawText(hint, { x: x + 10, y: draw.y - 48, size: 7, font: draw.regular, color: MUTED });
      }
    });
    draw.y -= 68;
  }
}

function drawAllowances(draw: Draw, model: StatementModel) {
  if (!model.allowances.length) return;
  ensure(draw, 22);
  drawLine(draw, "Droits de dépense", MARGIN, draw.y - 12, 11, draw.bold, INK);
  draw.y -= 22;
  for (const account of model.allowances) {
    ensure(draw, 28);
    drawLine(draw, account.name, MARGIN, draw.y - 12, 10, draw.bold, INK);
    drawRight(draw, account.remaining, PAGE_W - MARGIN, draw.y - 12, 10, draw.bold, INK);
    drawLine(draw, `Droit de dépense ${account.allowance}`, MARGIN, draw.y - 24, 8, draw.regular, MUTED);
    draw.y -= 34;
  }
}

const COL_DATE = MARGIN;
const COL_LABEL = MARGIN + 74;
const LABEL_W = 230;
const COL_DEBIT = PAGE_W - MARGIN - 104;
const COL_CREDIT = PAGE_W - MARGIN;

function drawTableHead(draw: Draw) {
  ensure(draw, 22);
  draw.page.drawRectangle({
    x: MARGIN,
    y: draw.y - 18,
    width: PAGE_W - MARGIN * 2,
    height: 18,
    color: CREAM,
  });
  const baseline = draw.y - 13;
  drawLine(draw, "DATE", COL_DATE + 4, baseline, 7, draw.bold, GOLD);
  drawLine(draw, "LIBELLÉ", COL_LABEL, baseline, 7, draw.bold, GOLD);
  drawRight(draw, "DÉBIT", COL_DEBIT, baseline, 7, draw.bold, GOLD);
  drawRight(draw, "CRÉDIT", COL_CREDIT, baseline, 7, draw.bold, GOLD);
  draw.y -= 22;
}

function rowHeight(draw: Draw, row: StatementRow) {
  const titleLines = wrap(draw.regular, row.title, 9, LABEL_W);
  const metaLines = row.meta ? wrap(draw.regular, row.meta, 7.5, LABEL_W) : [];
  return 8 + Math.max(1, titleLines.length) * 12 + metaLines.length * 10 + 6;
}

function drawMovement(draw: Draw, row: StatementRow, zebra: boolean) {
  const titleLines = wrap(draw.regular, row.title, 9, LABEL_W);
  const metaLines = row.meta ? wrap(draw.regular, row.meta, 7.5, LABEL_W) : [];
  const height = rowHeight(draw, row);
  if (draw.y - height < contentBottom()) {
    openPage(draw, true);
    drawTableHead(draw);
  }
  if (zebra) {
    draw.page.drawRectangle({
      x: MARGIN,
      y: draw.y - height,
      width: PAGE_W - MARGIN * 2,
      height,
      color: CREAM,
    });
  }
  const baseline = draw.y - 14;
  drawLine(draw, row.date, COL_DATE + 4, baseline, 8, draw.regular, MUTED);
  titleLines.forEach((line, index) => {
    drawLine(draw, line, COL_LABEL, baseline - index * 12, 9, draw.regular, INK);
  });
  metaLines.forEach((line, index) => {
    drawLine(draw, line, COL_LABEL, baseline - titleLines.length * 12 - index * 10, 7.5, draw.regular, MUTED);
  });
  if (row.debit) drawRight(draw, row.debit, COL_DEBIT, baseline, 9, draw.bold, INK);
  if (row.credit) drawRight(draw, row.credit, COL_CREDIT, baseline, 9, draw.bold, INK);
  draw.y -= height;
}

function drawRows(draw: Draw, rows: StatementRow[]) {
  if (!rows.length) return;
  drawTableHead(draw);
  rows.forEach((row, index) => drawMovement(draw, row, index % 2 === 1));
}

function drawStay(draw: Draw, stay: StatementStay) {
  const titleLines = wrap(draw.bold, stay.title, 11, PAGE_W - MARGIN * 2 - 120);
  const metaLines = stay.meta ? wrap(draw.regular, stay.meta, 8, PAGE_W - MARGIN * 2) : [];
  const head = 8 + titleLines.length * 14 + metaLines.length * 11 + 8;
  ensure(draw, head + 24);
  let baseline = draw.y - 12;
  titleLines.forEach((line, index) => {
    drawLine(draw, line, MARGIN, baseline - index * 14, 11, draw.bold, INK);
  });
  if (stay.amount) drawRight(draw, stay.amount, PAGE_W - MARGIN, baseline, 11, draw.bold, INK);
  baseline -= titleLines.length * 14;
  metaLines.forEach((line) => {
    drawLine(draw, line, MARGIN, baseline, 8, draw.regular, MUTED);
    baseline -= 11;
  });
  draw.y = baseline - 6;
  drawRows(draw, stay.rows);
  draw.y -= 6;
}

function drawSection(draw: Draw, section: StatementSection) {
  if (!section.stays.length && !section.rows.length) return;
  ensure(draw, 24);
  drawLine(draw, section.heading, MARGIN, draw.y - 12, 13, draw.bold, INK);
  draw.y -= 24;
  for (const stay of section.stays) drawStay(draw, stay);
  drawRows(draw, section.rows);
  draw.y -= 8;
}

function stampPages(draw: Draw) {
  const total = draw.pages.length;
  draw.pages.forEach((page, index) => {
    const label = `${index + 1} / ${total}`;
    const width = draw.regular.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: PAGE_W - MARGIN - width,
      y: FOOTER_TOP + 6,
      size: 8,
      font: draw.regular,
      color: MUTED,
    });
  });
}

/** PDF A4 du relevé. Le texte suit le modèle, pas une mise en page inventée. */
export async function renderStatementPdf(model: StatementModel) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} — Travel Business Agency`);
  doc.setAuthor(siteConfig.legal.legalName);
  doc.setCreator("Travel Business Agency");
  doc.setSubject(model.number);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoPng = await loadBrandLogoPng();
  const logo = logoPng ? await doc.embedPng(logoPng) : null;
  const draw: Draw = { doc, page: null as unknown as PDFPage, pages: [], y: 0, regular, bold, title: model.title, logo };
  openPage(draw, false);
  drawIdentity(draw, model);
  drawSummaries(draw, model.summaries);
  drawAllowances(draw, model);
  for (const section of model.sections) drawSection(draw, section);
  if (model.emptyNote) {
    ensure(draw, 24);
    drawLine(draw, model.emptyNote, MARGIN, draw.y - 12, 10, draw.regular, MUTED);
  }
  stampPages(draw);
  return doc.save();
}
