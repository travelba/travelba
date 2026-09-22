import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getDocumentProxy, extractImages, getResolvedPDFJS } from "unpdf";
import { bundledPdfjsVersion, pdfPlainText } from "./pdf-raster";

const MINIMAL_PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 12 12]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

test("bundled PDF.js stays on unpdf 5.6 and opens a PDF", async () => {
  const version = await bundledPdfjsVersion();
  assert.match(version, /^5\.6/);
  const text = await pdfPlainText(new TextEncoder().encode(MINIMAL_PDF));
  assert.equal(text.pages, 1);
});

test("a scanned identity PDF yields an embedded page image", async () => {
  const sample = process.env.TRAVELBA_PASSPORT_PDF_SAMPLE;
  if (!sample) {
    const pdfjs = await getResolvedPDFJS();
    assert.match(String(pdfjs.version || ""), /^5\.6/);
    return;
  }
  const bytes = new Uint8Array(readFileSync(sample));
  const pdf = await getDocumentProxy(bytes);
  const images = await extractImages(pdf, 1);
  assert.equal(pdf.numPages, 1);
  assert.ok(images.length >= 1);
  assert.ok(images[0].width * images[0].height > 1000);
});
