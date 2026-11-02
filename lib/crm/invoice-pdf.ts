import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { loadBrandLogoPng } from "./brand-logo";
import { invoiceDocument, type InvoiceDocument, type InvoiceInput } from "./invoice-document";
import { pdfSafe } from "./statement-pdf";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const FOOTER_TOP = 118;
const NAVY = rgb(0x0b / 255, 0x19 / 255, 0x2c / 255);
const GOLD = rgb(0xc5 / 255, 0xa8 / 255, 0x80 / 255);
const CREAM = rgb(0xfa / 255, 0xf9 / 255, 0xf6 / 255);
const MUTED = rgb(0x5c / 255, 0x65 / 255, 0x70 / 255);
const WHITE = rgb(1, 1, 1);

function wrap(font: PDFFont, value: string, size: number, maxWidth: number) {
  const source = pdfSafe(font, value);
  if (!source) return [];
  const words = source.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [];
}

type Draw = {
  doc: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  model: InvoiceDocument;
};

function contentBottom() {
  return FOOTER_TOP + 18;
}

function paintHeader(draw: Draw, continued: boolean) {
  const { page, bold, regular, model } = draw;
  if (!continued) {
    page.drawRectangle({ x: 0, y: PAGE_H - 108, width: PAGE_W, height: 108, color: NAVY });
    page.drawRectangle({ x: 0, y: PAGE_H - 112, width: PAGE_W, height: 4, color: GOLD });
    if (draw.logo) {
      page.drawImage(draw.logo, { x: MARGIN - 2, y: PAGE_H - 78, width: 40, height: 40 });
    } else {
      const mark = "TBA";
      const markWidth = bold.widthOfTextAtSize(mark, 9);
      page.drawText(mark, { x: MARGIN + (36 - markWidth) / 2, y: PAGE_H - 62, size: 9, font: bold, color: GOLD });
    }
    page.drawText(pdfSafe(bold, "TRAVEL BUSINESS AGENCY"), {
      x: MARGIN + 48,
      y: PAGE_H - 56,
      size: 9,
      font: bold,
      color: GOLD,
    });
    page.drawText("Agence de voyage", {
      x: MARGIN + 48,
      y: PAGE_H - 72,
      size: 8,
      font: regular,
      color: WHITE,
    });
    const heading = pdfSafe(bold, model.kicker.toUpperCase());
    const headingWidth = bold.widthOfTextAtSize(heading, 13);
    page.drawText(heading, {
      x: PAGE_W - MARGIN - headingWidth,
      y: PAGE_H - 58,
      size: 13,
      font: bold,
      color: WHITE,
    });
    const sub = pdfSafe(regular, model.numberLabel);
    const subWidth = regular.widthOfTextAtSize(sub, 9);
    page.drawText(sub, {
      x: PAGE_W - MARGIN - subWidth,
      y: PAGE_H - 74,
      size: 9,
      font: regular,
      color: WHITE,
    });
    draw.y = PAGE_H - 132;
    return;
  }
  page.drawRectangle({ x: 0, y: PAGE_H - 36, width: PAGE_W, height: 36, color: NAVY });
  page.drawRectangle({ x: 0, y: PAGE_H - 39, width: PAGE_W, height: 3, color: GOLD });
  page.drawText("TRAVEL BUSINESS AGENCY", { x: MARGIN, y: PAGE_H - 24, size: 8, font: bold, color: GOLD });
  const heading = pdfSafe(regular, `${model.kicker} ${model.numberLabel}`);
  const headingWidth = regular.widthOfTextAtSize(heading, 9);
  page.drawText(heading, { x: PAGE_W - MARGIN - headingWidth, y: PAGE_H - 24, size: 9, font: regular, color: WHITE });
  draw.y = PAGE_H - 56;
}

function paintFooters(draw: Draw) {
  const font = draw.regular;
  const total = draw.pages.length;
  draw.pages.forEach((page, index) => {
    page.drawRectangle({ x: 0, y: FOOTER_TOP, width: PAGE_W, height: 1.5, color: GOLD });
    let baseline = FOOTER_TOP - 14;
    for (const line of draw.model.legal.slice(0, 6)) {
      for (const row of wrap(font, line, 6.5, PAGE_W - MARGIN * 2 - 36)) {
        if (baseline < 28) break;
        page.drawText(row, { x: MARGIN, y: baseline, size: 6.5, font, color: MUTED });
        baseline -= 8;
      }
    }
    const mark = pdfSafe(font, `${index + 1} / ${total}`);
    const width = font.widthOfTextAtSize(mark, 7);
    page.drawText(mark, { x: PAGE_W - MARGIN - width, y: 18, size: 7, font, color: MUTED });
  });
}

function newPage(draw: Draw, continued: boolean) {
  draw.page = draw.doc.addPage([PAGE_W, PAGE_H]);
  draw.pages.push(draw.page);
  paintHeader(draw, continued);
}

function ensure(draw: Draw, height: number) {
  if (draw.y - height < contentBottom()) newPage(draw, true);
}

function textAt(
  draw: Draw,
  value: string,
  x: number,
  size: number,
  font: PDFFont,
  color = NAVY
) {
  const safe = pdfSafe(font, value);
  if (!safe) return;
  draw.page.drawText(safe, { x, y: draw.y, size, font, color });
}

function drawRight(draw: Draw, value: string, size: number, font: PDFFont, color = NAVY) {
  const safe = pdfSafe(font, value);
  if (!safe) return;
  const width = font.widthOfTextAtSize(safe, size);
  draw.page.drawText(safe, { x: PAGE_W - MARGIN - width, y: draw.y, size, font, color });
}

export async function renderInvoicePdf(input: InvoiceInput | InvoiceDocument) {
  const model = "message" in input ? input : invoiceDocument(input);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoPng = await loadBrandLogoPng();
  const logo = logoPng ? await doc.embedPng(logoPng) : null;
  const draw: Draw = { doc, page: doc.addPage([PAGE_W, PAGE_H]), pages: [], y: PAGE_H, regular, bold, logo, model };
  draw.pages.push(draw.page);
  paintHeader(draw, false);

  const leftW = 250;
  const rightX = 320;
  const issuerTop = draw.y;
  let leftY = issuerTop;
  model.issuer.forEach((line, index) => {
    const size = index === 0 ? 9 : 8;
    const font = index === 0 ? bold : regular;
    const color = index === 0 ? NAVY : MUTED;
    for (const row of wrap(font, line, size, leftW)) {
      draw.page.drawText(row, { x: MARGIN, y: leftY, size, font, color });
      leftY -= size + 3;
    }
  });

  const meta = [
    ["Date d'émission", model.issuedLabel],
    ["Échéance", model.dueLabel],
    ["Séjour", model.title],
    ["Référence", model.reference],
    ["Dates", model.dates],
  ].filter((row) => row[1]);
  let rightY = issuerTop;
  for (const [label, value] of meta) {
    const safeLabel = pdfSafe(bold, label);
    draw.page.drawText(safeLabel, { x: rightX, y: rightY, size: 7, font: bold, color: GOLD });
    rightY -= 11;
    for (const line of wrap(regular, value, 9, PAGE_W - MARGIN - rightX)) {
      draw.page.drawText(line, { x: rightX, y: rightY, size: 9, font: regular, color: NAVY });
      rightY -= 12;
    }
    rightY -= 4;
  }
  draw.y = Math.min(leftY, rightY) - 10;

  ensure(draw, 28 + model.billTo.length * 12);
  draw.page.drawRectangle({
    x: MARGIN,
    y: draw.y - model.billTo.length * 12 - 8,
    width: PAGE_W - MARGIN * 2,
    height: 22 + model.billTo.length * 12,
    color: CREAM,
  });
  textAt(draw, "Facturé à", MARGIN + 10, 8, bold, GOLD);
  draw.y -= 14;
  for (const line of model.billTo) {
    textAt(draw, line, MARGIN + 10, 10, regular);
    draw.y -= 12;
  }
  draw.y -= 16;

  ensure(draw, 28);
  textAt(draw, "Prestation", MARGIN, 8, bold, MUTED);
  drawRight(draw, "Montant", 8, bold, MUTED);
  draw.y -= 6;
  draw.page.drawRectangle({ x: MARGIN, y: draw.y, width: PAGE_W - MARGIN * 2, height: 0.4, color: MUTED });
  draw.y -= 16;

  for (const line of model.lines) {
    const wrapped = wrap(regular, line.label, 10, PAGE_W - MARGIN * 2 - 110);
    const rows = wrapped.length ? wrapped : [pdfSafe(regular, "Prestation")];
    ensure(draw, rows.length * 13 + 4);
    rows.forEach((row, index) => {
      draw.page.drawText(row, { x: MARGIN, y: draw.y, size: 10, font: regular, color: NAVY });
      if (index === 0) drawRight(draw, line.amountLabel, 10, regular);
      draw.y -= 13;
    });
  }

  draw.y -= 6;
  const totals: [string, string, boolean][] = [];
  if (model.vatMode === "detail" && model.htLabel && model.taxLabel) {
    totals.push(["Total HT", model.htLabel, false], ["TVA", model.taxLabel, false], ["Total TTC", model.totalLabel, false]);
  } else {
    totals.push(["Total TTC", model.totalLabel, false]);
  }
  totals.push(["Acomptes déjà versés", model.depositsLabel, false], ["Reste à payer", model.balanceLabel, true]);
  if (model.surplusLabel) totals.push(["Trop-perçu", model.surplusLabel, false]);
  const boxHeight = totals.length * 16 + 16;
  ensure(draw, boxHeight + 8);
  draw.page.drawRectangle({
    x: PAGE_W - MARGIN - 220,
    y: draw.y - boxHeight + 16,
    width: 220,
    height: boxHeight,
    color: CREAM,
  });
  for (const [label, value, strong] of totals) {
    const font = strong ? bold : regular;
    textAt(draw, label, PAGE_W - MARGIN - 208, strong ? 11 : 9, font);
    drawRight(draw, value, strong ? 11 : 9, font);
    draw.y -= strong ? 16 : 13;
  }
  draw.y -= 18;

  ensure(draw, 78);
  textAt(draw, "Règlement", MARGIN, 8, bold, GOLD);
  draw.y -= 14;
  if (model.paymentMissing) {
    textAt(draw, "Les coordonnées de virement sont confirmées par l'agence.", MARGIN, 10, regular);
    draw.y -= 14;
  } else {
    for (const line of model.paymentLines) {
      ensure(draw, 14);
      textAt(draw, line, MARGIN, 10, line.startsWith("IBAN") ? bold : regular);
      draw.y -= 13;
    }
  }
  if (model.stripeUrl) {
    ensure(draw, 28);
    textAt(draw, "Paiement par carte", MARGIN, 8, bold, GOLD);
    draw.y -= 13;
    for (const line of wrap(regular, model.stripeUrl, 9, PAGE_W - MARGIN * 2)) {
      ensure(draw, 12);
      textAt(draw, line, MARGIN, 9, regular);
      draw.y -= 12;
    }
  }
  draw.y -= 8;
  for (const line of model.legal.slice(5)) {
    for (const row of wrap(regular, line, 8, PAGE_W - MARGIN * 2)) {
      ensure(draw, 11);
      textAt(draw, row, MARGIN, 8, regular, MUTED);
      draw.y -= 10;
    }
  }

  paintFooters(draw);
  return doc.save();
}
