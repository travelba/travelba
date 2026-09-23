import {
  extractImages,
  extractText,
  getDocumentProxy,
  getResolvedPDFJS,
  renderPageAsImage,
} from "unpdf";

export type RasterPage = {
  image: Uint8Array;
  mediaType: "image/jpeg" | "image/png";
};

/**
 * unpdf charge PDF.js 5.6.205. Relancer definePDFJSModule (même unpdf/pdfjs)
 * casse le worker (DataCloneError). Ne jamais importer pdfjs-dist 5.7 ici.
 *
 * getDocumentProxy **transfère** le ArrayBuffer au worker : un second passage
 * sur les mêmes octets lève DataCloneError. On clone toujours avant d’ouvrir.
 */
export async function ensureBundledPdfjs() {
  const pdfjs = await getResolvedPDFJS();
  const version = String(pdfjs.version || "");
  if (version && !version.startsWith("5.6")) {
    console.error("[pdf-raster] PDF.js", version, "attendu 5.6 (bundle unpdf)");
  }
}

export function clonePdfBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function openPdf(bytes: Uint8Array) {
  await ensureBundledPdfjs();
  return getDocumentProxy(clonePdfBytes(bytes));
}

export async function bundledPdfjsVersion() {
  await ensureBundledPdfjs();
  const pdfjs = await getResolvedPDFJS();
  return String(pdfjs.version || "");
}

async function encodeRawViaCanvas(
  data: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3 | 4
): Promise<RasterPage | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    const rgba = imageData.data;
    if (channels === 4) {
      rgba.set(data);
    } else if (channels === 3) {
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        rgba[j] = data[i];
        rgba[j + 1] = data[i + 1];
        rgba[j + 2] = data[i + 2];
        rgba[j + 3] = 255;
      }
    } else {
      for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
        rgba[j] = rgba[j + 1] = rgba[j + 2] = data[i];
        rgba[j + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const jpeg = canvas.toBuffer("image/jpeg");
    return { image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function encodeJpeg(
  data: Uint8Array,
  raw?: { width: number; height: number; channels: 1 | 3 | 4 }
): Promise<RasterPage | null> {
  try {
    const sharp = (await import("sharp")).default;
    const pipeline = raw
      ? sharp(data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } })
      : sharp(data);
    const jpeg = await pipeline
      .rotate()
      .resize({ width: 1800, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
  } catch {
    if (raw) return encodeRawViaCanvas(data, raw.width, raw.height, raw.channels);
    return { image: data, mediaType: "image/png" };
  }
}

async function rasterOnePage(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  page: number
): Promise<RasterPage | null> {
  try {
    const png = await renderPageAsImage(pdf, page, {
      canvasImport: () => import("@napi-rs/canvas"),
      scale: 1.6,
    });
    const part = await encodeJpeg(new Uint8Array(png as ArrayBuffer));
    if (part) return part;
  } catch {
    /* image embarquée */
  }
  try {
    const images = await extractImages(pdf, page);
    const ranked = [...images].sort(
      (a, b) => b.width * b.height - a.width * a.height
    );
    for (const img of ranked.slice(0, 2)) {
      const part = await encodeJpeg(new Uint8Array(img.data), {
        width: img.width,
        height: img.height,
        channels: img.channels,
      });
      if (part) return part;
    }
  } catch {
    /* page suivante */
  }
  return null;
}

export async function rasterPdfPages(bytes: Uint8Array, maxPages = 2): Promise<RasterPage[]> {
  const pdf = await openPdf(bytes);
  const pages = Math.min(pdf.numPages || 1, maxPages);
  const out: RasterPage[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const part = await rasterOnePage(pdf, page);
    if (part) out.push(part);
  }
  return out;
}

export async function pdfPlainText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const pdf = await openPdf(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    return { text: extracted.text || "", pages: extracted.totalPages || pdf.numPages || 1 };
  } catch {
    return { text: "", pages: 1 };
  }
}

export async function inspectPdf(
  bytes: Uint8Array,
  maxPages = 2
): Promise<{ text: string; pages: number; rasters: RasterPage[] }> {
  const pdf = await openPdf(bytes);
  let text = "";
  try {
    const extracted = await extractText(pdf, { mergePages: true });
    text = extracted.text || "";
  } catch {
    /* scan image sans calque */
  }
  const pages = Math.min(pdf.numPages || 1, maxPages);
  const rasters: RasterPage[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const part = await rasterOnePage(pdf, page);
    if (part) rasters.push(part);
  }
  return { text, pages: pdf.numPages || pages, rasters };
}
