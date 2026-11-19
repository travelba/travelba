import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { loadBrandLogoPng } from "./brand-logo";
import { groupedInvoiceDocument, type GroupedInvoiceDocument, type GroupedSectionInput } from "./grouped-invoice";
import type { InvoiceWire } from "./invoice-document";
import { pdfSafe } from "./statement-pdf";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const FOOTER_TOP = 108;
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
  return lines;
}

type Draw = {
  doc: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  model: GroupedInvoiceDocument;
};

function contentBottom() {
  return FOOTER_TOP + 16;
}

function paintHeader(draw: Draw, continued: boolean) {
  const { page, bold, regular, model } = draw;
  if (!continued) {
    page.drawRectangle({ x: 0, y: PAGE_H - 108, width: PAGE_W, height: 108, color: NAVY });
    page.drawRectangle({ x: 0, y: PAGE_H - 112, width: PAGE_W, height: 4, color: GOLD });
    if (draw.logo) {
      page.drawImage(draw.logo, { x: MARGIN - 2, y: PAGE_H - 78, width: 40, height: 40 });
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
    for (const line of draw.model.legal.slice(0, 4)) {
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

function textAt(draw: Draw, value: string, x: number, size: number, font: PDFFont, color = NAVY) {
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

function paintSection(draw: Draw, index: number) {
  const section = draw.model.sections[index];
  if (draw.y - 150 < contentBottom()) newPage(draw, true);
  const title = [section.reference, section.destination].filter(Boolean).join(" · ");
  const meta = [section.dates, section.travelers.length ? `Voyageurs : ${section.travelers.join(", ")}` : ""]
    .filter(Boolean)
    .join("  ·  ");
  ensure(draw, 54);
  draw.page.drawRectangle({
    x: MARGIN,
    y: draw.y - 8,
    width: PAGE_W - MARGIN * 2,
    height: 22,
    color: CREAM,
  });
  textAt(draw, title || "Séjour", MARGIN + 8, 10, draw.bold);
  draw.y -= 16;
  if (meta) {
    textAt(draw, meta, MARGIN + 8, 8, draw.regular, MUTED);
    draw.y -= 14;
  } else {
    draw.y -= 6;
  }
  ensure(draw, 22);
  textAt(draw, "Prestation", MARGIN, 8, draw.bold, MUTED);
  drawRight(draw, "Montant", 8, draw.bold, MUTED);
  draw.y -= 6;
  draw.page.drawRectangle({ x: MARGIN, y: draw.y, width: PAGE_W - MARGIN * 2, height: 0.4, color: MUTED });
  draw.y -= 14;
  for (const line of section.lines) {
    const rows = wrap(draw.regular, line.label, 10, PAGE_W - MARGIN * 2 - 120);
    const painted = rows.length ? rows : [pdfSafe(draw.regular, "Prestation")];
    ensure(draw, painted.length * 13 + 2);
    painted.forEach((row, rowIndex) => {
      draw.page.drawText(row, { x: MARGIN, y: draw.y, size: 10, font: draw.regular, color: NAVY });
      if (rowIndex === 0) drawRight(draw, line.amountLabel, 10, draw.regular);
      draw.y -= 13;
    });
  }
  const totals: [string, string][] = [
    ["Sous-total", section.subtotalLabel],
    ["Déjà reçu", section.paidLabel],
    ["Reste sur ce dossier", section.balanceLabel],
  ];
  if (section.surplusLabel) totals.push(["Trop-perçu sur ce dossier", section.surplusLabel]);
  ensure(draw, totals.length * 13 + 8);
  draw.y -= 4;
  for (const [label, value] of totals) {
    textAt(draw, label, PAGE_W - MARGIN - 230, 9, draw.regular, MUTED);
    drawRight(draw, value, 9, draw.bold);
    draw.y -= 13;
  }
  if (section.payments.length) {
    draw.y -= 2;
    for (const payment of section.payments) {
      const rows = wrap(draw.regular, payment.label, 8, PAGE_W - MARGIN * 2 - 110);
      ensure(draw, rows.length * 11 + 2);
      rows.forEach((row, rowIndex) => {
        draw.page.drawText(row, { x: MARGIN, y: draw.y, size: 8, font: draw.regular, color: MUTED });
        if (rowIndex === 0) drawRight(draw, payment.amountLabel, 8, draw.regular, MUTED);
        draw.y -= 11;
      });
    }
  }
  if (section.foreignPayments) {
    ensure(draw, 14);
    textAt(draw, "Un paiement hors euros n'est pas converti.", MARGIN, 8, draw.regular, MUTED);
    draw.y -= 12;
  }
  draw.y -= 10;
}

export async function renderGroupedInvoicePdf(
  input:
    | GroupedInvoiceDocument
    | {
        number: string;
        billTo: string[];
        payerLabel: string;
        sections: GroupedSectionInput[];
        now?: Date;
        dueDays?: number | null;
        wire?: InvoiceWire | null;
        outsideEu?: boolean;
      }
) {
  const model = "clientText" in input ? input : groupedInvoiceDocument(input);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoPng = await loadBrandLogoPng();
  const logo = logoPng ? await doc.embedPng(logoPng) : null;
  const draw: Draw = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    pages: [],
    y: PAGE_H,
    regular,
    bold,
    logo,
    model,
  };
  draw.pages.push(draw.page);
  paintHeader(draw, false);

  const leftW = 250;
  let leftY = draw.y;
  model.issuer.forEach((line, index) => {
    const size = index === 0 ? 9 : 8;
    const font = index === 0 ? bold : regular;
    const color = index === 0 ? NAVY : MUTED;
    for (const row of wrap(font, line, size, leftW)) {
      draw.page.drawText(row, { x: MARGIN, y: leftY, size, font, color });
      leftY -= size + 3;
    }
  });
  const rightX = 320;
  let rightY = draw.y;
  const meta: [string, string][] = [
    ["Date d'émission", model.issuedLabel],
    ["Échéance", model.dueLabel],
    ["Payeur", model.payerLabel],
    ["Dossiers", String(model.sections.length)],
  ];
  for (const [label, value] of meta) {
    if (!value) continue;
    draw.page.drawText(pdfSafe(bold, label), { x: rightX, y: rightY, size: 7, font: bold, color: GOLD });
    rightY -= 11;
    for (const line of wrap(regular, value, 9, PAGE_W - MARGIN - rightX)) {
      draw.page.drawText(line, { x: rightX, y: rightY, size: 9, font: regular, color: NAVY });
      rightY -= 12;
    }
    rightY -= 4;
  }
  draw.y = Math.min(leftY, rightY) - 8;

  ensure(draw, 28 + model.billTo.length * 12);
  const boxHeight = 22 + Math.max(1, model.billTo.length) * 12;
  draw.page.drawRectangle({
    x: MARGIN,
    y: draw.y - boxHeight + 16,
    width: PAGE_W - MARGIN * 2,
    height: boxHeight,
    color: CREAM,
  });
  textAt(draw, "Facturé à", MARGIN + 10, 8, bold, GOLD);
  draw.y -= 14;
  for (const line of model.billTo.length ? model.billTo : ["—"]) {
    textAt(draw, line, MARGIN + 10, 10, regular);
    draw.y -= 12;
  }
  draw.y -= 16;

  model.sections.forEach((_, index) => paintSection(draw, index));

  const grand: [string, string, boolean][] = [
    ["Total général", model.totalLabel, false],
    ["Total payé", model.paidLabel, false],
    ["Reste à payer", model.balanceLabel, true],
  ];
  if (model.surplusLabel) grand.push(["Trop-perçu", model.surplusLabel, false]);
  const grandHeight = grand.length * 16 + 16;
  ensure(draw, grandHeight + 8);
  draw.page.drawRectangle({
    x: PAGE_W - MARGIN - 240,
    y: draw.y - grandHeight + 16,
    width: 240,
    height: grandHeight,
    color: NAVY,
  });
  for (const [label, value, strong] of grand) {
    const size = strong ? 11 : 9;
    textAt(draw, label, PAGE_W - MARGIN - 228, size, strong ? bold : regular, WHITE);
    drawRight(draw, value, size, strong ? bold : regular, strong ? GOLD : WHITE);
    draw.y -= strong ? 16 : 13;
  }
  draw.y -= 18;

  ensure(draw, 48);
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
  draw.y -= 6;
  for (const line of model.legal.slice(4)) {
    for (const row of wrap(regular, line, 8, PAGE_W - MARGIN * 2)) {
      ensure(draw, 11);
      textAt(draw, row, MARGIN, 8, regular, MUTED);
      draw.y -= 10;
    }
  }

  paintFooters(draw);
  return doc.save();
}
