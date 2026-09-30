import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { renderPageAsImage } from "unpdf";
import {
  documentPriceDecided,
  PRICE_TRUNCATE_RATIO,
  priceCoverSpans,
  readHidePricesChoice,
  readPdfGlyphs,
  redactPdfPrices,
  truncateImageBottom,
  truncatePdfBottom,
} from "./pdf-price-redact";
import { openPdf } from "./pdf-raster";

describe("priceCoverSpans", () => {
  it("couvre le montant et la devise, pas le libellé ni le dossier", () => {
    const line = "Total 1 250,00 EUR";
    const spans = priceCoverSpans(line);
    const covered = spans.map(([start, end]) => line.slice(start, end)).join(" ");
    assert.match(covered, /1 250,00/);
    assert.match(covered, /EUR/);
    assert.equal(covered.includes("Total"), false);
    assert.equal(priceCoverSpans("PNR AB12CD").length, 0);
    assert.equal(priceCoverSpans("03/08/2026").length, 0);
    assert.equal(priceCoverSpans("AF1234").length, 0);
    assert.equal(priceCoverSpans("Tel +33 6 12 34 56 78").length, 0);
    const usd = "Fare $1,250.00";
    const usdCovered = priceCoverSpans(usd).map(([start, end]) => usd.slice(start, end)).join(" ");
    assert.match(usdCovered, /1,250\.00/);
    assert.match(usdCovered, /\$/);
  });

  it("couvre un NET imprimé et ignore une date à points", () => {
    const net = priceCoverSpans("NET 890.00 CHF").map(([start, end]) => "NET 890.00 CHF".slice(start, end));
    assert.ok(net.some((part) => part.includes("890.00")));
    assert.equal(priceCoverSpans("03.08.2026").length, 0);
  });
});

describe("readHidePricesChoice", () => {
  it("n’invente pas de réponse", () => {
    assert.equal(readHidePricesChoice("1"), true);
    assert.equal(readHidePricesChoice("0"), false);
    assert.equal(readHidePricesChoice(true), true);
    assert.equal(readHidePricesChoice(false), false);
    assert.equal(readHidePricesChoice(null), undefined);
    assert.equal(readHidePricesChoice(""), undefined);
    assert.equal(documentPriceDecided(null), false);
    assert.equal(documentPriceDecided(false), true);
  });
});

async function raster(bytes: Uint8Array) {
  const pdf = await openPdf(bytes);
  const png = await renderPageAsImage(pdf, 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 2,
  });
  const { data, info } = await sharp(Buffer.from(png as ArrayBuffer))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, pageHeight: info.height / 2 };
}

function meanLuminance(
  raw: { data: Buffer; width: number; height: number; pageHeight: number },
  box: { x: number; y: number; width: number; height: number }
) {
  const scale = 2;
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor((raw.pageHeight - box.y - box.height) * scale));
  const right = Math.min(raw.width, Math.ceil((box.x + box.width) * scale));
  const bottom = Math.min(raw.height, Math.ceil((raw.pageHeight - box.y) * scale));
  let sum = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = (y * raw.width + x) * 4;
      sum += raw.data[index] + raw.data[index + 1] + raw.data[index + 2];
      count += 3;
    }
  }
  return count ? sum / count : 0;
}

describe("redactPdfPrices", () => {
  it("blanchit le montant et laisse le PNR", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const size = 18;
    page.drawText("Total 1 250,00 EUR", { x: 72, y: 700, size, font });
    page.drawText("PNR AB12CD", { x: 72, y: 660, size, font });
    page.drawText("03/08/2026", { x: 72, y: 620, size, font });
    const prefix = font.widthOfTextAtSize("Total ", size);
    const amountWidth = font.widthOfTextAtSize("1 250,00", size);
    const pnrWidth = font.widthOfTextAtSize("PNR AB12CD", size);
    const bytes = new Uint8Array(await doc.save());

    const redacted = await redactPdfPrices(bytes);
    assert.equal(redacted.ok, true);
    if (!redacted.ok) return;
    assert.equal(redacted.changed, true);

    const before = await raster(bytes);
    const after = await raster(redacted.bytes);
    const amount = { x: 72 + prefix, y: 698, width: amountWidth, height: size };
    const pnr = { x: 72, y: 658, width: pnrWidth, height: size };
    const amountBefore = meanLuminance(before, amount);
    const amountAfter = meanLuminance(after, amount);
    const pnrBefore = meanLuminance(before, pnr);
    const pnrAfter = meanLuminance(after, pnr);

    assert.ok(amountBefore < 220, `montant encore lisible avant masquage (${amountBefore})`);
    assert.ok(amountAfter > 245, `montant encore visible (${amountAfter})`);
    assert.ok(Math.abs(pnrAfter - pnrBefore) < 12, `PNR modifié (${pnrBefore} → ${pnrAfter})`);
    assert.ok(pnrAfter < 230, `PNR effacé (${pnrAfter})`);
  });

  it("accepte un PDF sans prix et refuse un PDF sans texte", async () => {
    const plain = await PDFDocument.create();
    const page = plain.addPage();
    const font = await plain.embedFont(StandardFonts.Helvetica);
    page.drawText("PNR AB12CD", { x: 72, y: 700, size: 16, font });
    page.drawText("03/08/2026", { x: 72, y: 660, size: 16, font });
    const kept = await redactPdfPrices(new Uint8Array(await plain.save()));
    assert.equal(kept.ok, true);
    if (kept.ok) assert.equal(kept.changed, false);

    const empty = await PDFDocument.create();
    empty.addPage();
    const scanned = await redactPdfPrices(new Uint8Array(await empty.save()));
    assert.deepEqual(scanned, { ok: false, reason: "no-text" });
    const glyphs = await readPdfGlyphs(new Uint8Array(await plain.save()));
    assert.ok(glyphs.flat().some((glyph) => glyph.str.includes("AB12CD")));
  });
});

describe("truncateBottom", () => {
  it("retire le bas d’un PDF sans couper le texte du haut", async () => {
    const height = 400;
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, height]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 595.28,
      height: height * PRICE_TRUNCATE_RATIO,
      color: rgb(0, 0, 0),
    });
    page.drawText("SEJOUR CONFIRMATION", { x: 72, y: 320, size: 18, font });
    const bytes = new Uint8Array(await doc.save());
    const cut = await truncatePdfBottom(bytes);
    const opened = await PDFDocument.load(cut);
    const kept = opened.getPages()[0].getSize().height;
    assert.ok(Math.abs(kept - height * (1 - PRICE_TRUNCATE_RATIO)) < 1);

    const image = await raster(cut);
    const title = meanLuminance(image, { x: 72, y: 198, width: 220, height: 18 });
    const bottom = meanLuminance(image, { x: 20, y: 4, width: 200, height: 12 });
    assert.ok(title < 220, `titre illisible (${title})`);
    assert.ok(bottom > 245, `le bas noir est encore là (${bottom})`);
  });

  it("retire le bas d’une photo", async () => {
    const png = await sharp({
      create: { width: 40, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 40, height: 30, channels: 3, background: { r: 0, g: 0, b: 0 } },
          })
            .png()
            .toBuffer(),
          top: 70,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    const cut = await truncateImageBottom(new Uint8Array(png));
    const meta = await sharp(cut.bytes).metadata();
    assert.equal(meta.height, 70);
    const { data, info } = await sharp(cut.bytes).raw().toBuffer({ resolveWithObject: true });
    const bottom = data[(info.height - 1) * info.width * info.channels];
    assert.ok(bottom > 250);
  });
});
