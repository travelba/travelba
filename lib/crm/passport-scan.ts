import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractImages, renderPageAsImage } from "unpdf";
import type { ExtractedIdentity } from "./identity";
import { openPdf } from "./pdf-raster";
import { identitiesFromPassportOcr } from "./passport-mrz";
import { fieldScore } from "./passport-extract";
import { readDomicile, readIssueDate } from "./passport-visual";

const execFileAsync = promisify(execFile);
const ROTATIONS = [0, 90, 180, 270] as const;
const MRZ_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

type PageImage = { image: Buffer; width: number; height: number };

let tesseractKnown: boolean | null = null;

export async function tesseractAvailable() {
  if (tesseractKnown != null) return tesseractKnown;
  try {
    await execFileAsync("tesseract", ["--version"], { timeout: 4000 });
    tesseractKnown = true;
  } catch {
    tesseractKnown = false;
  }
  return tesseractKnown;
}

function isPdf(type: string, name: string) {
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

async function runTesseract(file: string, lang: string, whitelist: string | null, psm = "6") {
  const args = [file, "stdout", "-l", lang, "--psm", psm];
  if (whitelist) args.push("-c", `tessedit_char_whitelist=${whitelist}`);
  try {
    const { stdout } = await execFileAsync("tesseract", args, {
      timeout: 25000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout || "";
  } catch {
    return "";
  }
}

function mrzPromising(text: string) {
  const flat = text.toUpperCase().replace(/[^A-Z0-9<]/g, "");
  return /FRA|ISR|1SR/.test(flat) && (/<</.test(flat) || /\d{6}/.test(flat));
}

async function loadSharp() {
  const sharp = (await import("sharp")).default;
  return sharp;
}

async function jpegSize(image: Buffer): Promise<PageImage | null> {
  try {
    const sharp = await loadSharp();
    const meta = await sharp(image, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return null;
    return { image, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

async function popplerPages(bytes: Uint8Array): Promise<PageImage[] | null> {
  const dir = await mkdtemp(join(tmpdir(), "travelba-pdf-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    await writeFile(pdfPath, bytes);
    await execFileAsync("pdftoppm", ["-jpeg", "-r", "140", "-f", "1", "-l", "6", pdfPath, join(dir, "p")], {
      timeout: 30000,
    });
    const names = (await readdir(dir)).filter((name) => name.startsWith("p-") && name.endsWith(".jpg")).sort();
    const sharp = await loadSharp();
    const pages: PageImage[] = [];
    for (const name of names) {
      const image = await readFile(join(dir, name));
      const meta = await sharp(image, { failOn: "none" }).metadata();
      if (!meta.width || !meta.height) continue;
      pages.push({ image, width: meta.width, height: meta.height });
    }
    return pages.length ? pages : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function pdfImagePages(bytes: Uint8Array): Promise<Map<number, PageImage>> {
  const found = new Map<number, PageImage>();
  const dir = await mkdtemp(join(tmpdir(), "travelba-img-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    await writeFile(pdfPath, bytes);
    const { stdout } = await execFileAsync("pdfimages", ["-list", pdfPath], { timeout: 8000 });
    const rows = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d+\s+\d+\s+image/.test(line));
    if (!rows.length) return found;
    await execFileAsync("pdfimages", ["-j", pdfPath, join(dir, "img")], { timeout: 20000 });
    const sharp = await loadSharp();
    for (const row of rows) {
      const parts = row.split(/\s+/);
      const page = Number(parts[0]);
      const num = Number(parts[1]);
      if (parts[8] !== "jpeg" || !page || Number.isNaN(num)) continue;
      const file = join(dir, `img-${String(num).padStart(3, "0")}.jpg`);
      let image: Buffer;
      try {
        image = await readFile(file);
      } catch {
        continue;
      }
      const meta = await sharp(image, { failOn: "none" }).metadata();
      if (!meta.width || !meta.height || meta.width < 600 || meta.height < 600) continue;
      const prev = found.get(page);
      if (!prev || meta.width * meta.height > prev.width * prev.height) {
        found.set(page, { image, width: meta.width, height: meta.height });
      }
    }
    return found;
  } catch {
    return found;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function rasterPdfPages(bytes: Uint8Array): Promise<{ pages: PageImage[]; dateSheets: (PageImage | null)[] }> {
  const popped = await popplerPages(bytes);
  const embeddedJpegs = await pdfImagePages(bytes);
  const pdf = await openPdf(bytes);
  const count = Math.min(pdf.numPages || 1, 6);
  const sharp = await loadSharp();
  const pages: PageImage[] = [];
  const dateSheets: (PageImage | null)[] = [];
  for (let page = 1; page <= count; page += 1) {
    let embedded: PageImage | null = embeddedJpegs.get(page) || null;
    if (!embedded) try {
      const images = await extractImages(pdf, page);
      const ranked = [...images].sort((a, b) => b.width * b.height - a.width * a.height);
      const img = ranked[0];
      if (img && img.width >= 600 && img.height >= 600) {
        const jpeg = await sharp(Buffer.from(img.data), {
          raw: { width: img.width, height: img.height, channels: img.channels },
          failOn: "none",
        })
          .jpeg({ quality: 92 })
          .toBuffer();
        embedded = { image: jpeg, width: img.width, height: img.height };
      }
    } catch {
      embedded = null;
    }

    let chosen = embedded;
    if (!chosen) {
      try {
        const proxy = await pdf.getPage(page);
        const view = proxy.getViewport({ scale: 1 });
        const longEdge = Math.max(view.width, view.height);
        const scale = Math.min(2.2, Math.max(1.4, 3400 / Math.max(longEdge, 1)));
        const png = await renderPageAsImage(pdf, page, {
          canvasImport: () => import("@napi-rs/canvas"),
          scale,
        });
        const jpeg = await sharp(Buffer.from(png as ArrayBuffer), { failOn: "none" })
          .jpeg({ quality: 90 })
          .toBuffer();
        const meta = await sharp(jpeg).metadata();
        if (meta.width && meta.height) chosen = { image: jpeg, width: meta.width, height: meta.height };
      } catch {
        chosen = null;
      }
    }
    let pageImage = chosen;
    let small = false;
    const poppedPage = popped?.[page - 1];
    try {
      const proxy = await pdf.getPage(page);
      const view = proxy.getViewport({ scale: 1 });
      small = Math.max(view.width, view.height) < 700;
    } catch {
      small = false;
    }
    if (poppedPage) pageImage = small && chosen ? chosen : chosen || poppedPage;
    if (!pageImage) continue;
    const dateSheet = poppedPage && poppedPage !== pageImage && !small ? poppedPage : null;
    pages.push(pageImage);
    dateSheets.push(dateSheet);
  }
  return { pages, dateSheets };
}

async function ocrCrop(
  image: Buffer,
  rect: { left: number; top: number; width: number; height: number },
  dir: string,
  label: string,
  lang: string,
  whitelist: string | null,
  prep: "mrz" | "visual" | "digits",
  psm = "6"
) {
  if (rect.width < 40 || rect.height < 40) return "";
  const sharp = await loadSharp();
  const file = join(dir, `${label}.png`);
  let pipeline = sharp(image, { failOn: "none" }).extract(rect);
  if (prep === "mrz") {
    const mrzWidth = label.includes("mrz-head") ? 1400 : 2400;
    pipeline = pipeline.greyscale().normalize().sharpen().resize({ width: mrzWidth, withoutEnlargement: false });
  } else if (prep === "digits") {
    pipeline = pipeline.greyscale().negate().normalize().resize({ width: 2000, withoutEnlargement: false });
  } else {
    pipeline = pipeline.greyscale().normalize();
    const addressWidth = label.includes("addr-street-wide") ? 2100 : label.includes("addr-street") ? 1800 : 0;
    const target = addressWidth || (label.startsWith("dates") ? 2800 : psm === "11" ? 2000 : 2200);
    if (addressWidth || rect.width < target) {
      pipeline = pipeline.resize({ width: target, withoutEnlargement: false });
    }
  }
  await pipeline.png().toFile(file);
  return runTesseract(file, lang, whitelist, psm);
}

function bottomRect(width: number, height: number, fraction: number) {
  const top = Math.max(0, Math.round(height * (1 - fraction)));
  return { left: 0, top, width, height: Math.max(1, height - top) };
}

function bandRect(width: number, height: number, topFrac: number, bottomFrac: number) {
  const top = Math.round(height * topFrac);
  const bottom = Math.min(height, Math.round(height * bottomFrac));
  return { left: 0, top, width, height: Math.max(1, bottom - top) };
}

function chooseStreet(lines: Array<string | null>, corpus: string) {
  const usable = lines.filter((line): line is string => Boolean(line));
  if (!usable.length) return null;
  const upper = corpus.toUpperCase();
  const score = (line: string) => {
    const token = line.trim().split(/\s+/).at(-1)?.toUpperCase() || "";
    return token ? upper.split(token).length - 1 : 0;
  };
  return [...usable].sort((a, b) => score(b) - score(a) || b.length - a.length)[0];
}

function visualRect(width: number, height: number) {
  if (height / width >= 1.2) return bandRect(width, height, 0.5, 0.9);
  return { left: 0, top: 0, width, height: Math.round(height * 0.92) };
}

async function ocrVisual(image: Buffer, width: number, height: number, dir: string, angle: number) {
  if (height / width >= 1.2) {
    const main = await ocrCrop(image, visualRect(width, height), dir, `vis-${angle}`, "fra+eng", null, "visual");
    const names = await ocrCrop(
      image,
      bandRect(width, height, 0.52, 0.78),
      dir,
      `vis-${angle}-prenom`,
      "fra+eng",
      null,
      "visual",
      "6"
    );
    return `${names}\n${main}`;
  }
  const parts: string[] = [];
  const cols = 4;
  const rows = 2;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      parts.push(
        await ocrCrop(
          image,
          {
            left: col * cellW,
            top: row * cellH,
            width: col === cols - 1 ? width - col * cellW : cellW,
            height: row === rows - 1 ? height - row * cellH : cellH,
          },
          dir,
          `g-${angle}-${row}${col}`,
          "fra+eng",
          null,
          "visual"
        )
      );
    }
  }
  parts.push(
    await ocrCrop(image, bandRect(width, height, 0.4, 0.92), dir, `g-${angle}-low`, "fra+eng", null, "visual", "11")
  );
  parts.push(
    await ocrCrop(
      image,
      { left: 0, top: Math.round(height * 0.15), width: Math.round(width * 0.55), height: Math.round(height * 0.4) },
      dir,
      `g-${angle}-prenom`,
      "fra+eng",
      null,
      "visual",
      "11"
    )
  );
  parts.push(
    await ocrCrop(
      image,
      {
        left: Math.round(width * 0.35),
        top: Math.round(height * 0.55),
        width: Math.round(width * 0.65),
        height: Math.round(height * 0.35),
      },
      dir,
      `g-${angle}-auth`,
      "fra+eng",
      null,
      "visual",
      "6"
    )
  );
  return parts.join("\n");
}

async function ocrLandscapeName(image: Buffer, width: number, height: number, dir: string, angle: number) {
  const top = Math.round(height * 0.76);
  const bandHeight = Math.round(height * 0.88) - top;
  if (bandHeight < 40) return "";
  const sharp = await loadSharp();
  const band = await sharp(image, { failOn: "none" })
    .extract({ left: 0, top, width, height: bandHeight })
    .greyscale()
    .normalize()
    .toBuffer();
  const parts: string[] = [];
  const slices = [
    [0, 0.62],
    [0.25, 0.85],
    [0.45, 1],
  ] as const;
  for (const [start, end] of slices) {
    const left = Math.round(width * start);
    const sliceWidth = Math.max(1, Math.round(width * end) - left);
    const file = join(dir, `name-${angle}-${start}.png`);
    await sharp(band, { failOn: "none" })
      .extract({ left, top: 0, width: sliceWidth, height: bandHeight })
      .resize({ height: 320, withoutEnlargement: false })
      .threshold(140)
      .png()
      .toFile(file);
    parts.push(await runTesseract(file, "eng", MRZ_WHITELIST, "6"));
  }
  return parts.join("\n");
}

async function readOriented(
  image: Buffer,
  width: number,
  height: number,
  dir: string,
  angle: number
) {
  const mrzA = await ocrCrop(image, bottomRect(width, height, 0.16), dir, `mrz-${angle}-a`, "eng", MRZ_WHITELIST, "mrz");
  const mrzB = await ocrCrop(image, bottomRect(width, height, 0.12), dir, `mrz-${angle}-b`, "eng", MRZ_WHITELIST, "mrz");
  const headTop = Math.round(height * 0.9);
  const head = await ocrCrop(
    image,
    { left: 0, top: headTop, width: Math.max(40, Math.round(width * 0.42)), height: Math.max(40, height - headTop) },
    dir,
    `mrz-head-${angle}`,
    "eng",
    MRZ_WHITELIST,
    "mrz",
    "7"
  );
  return `${head}\n${mrzA}\n${mrzB}`;
}

async function scanPage(page: PageImage, dateSheet: PageImage | null): Promise<ExtractedIdentity[]> {
  const dir = await mkdtemp(join(tmpdir(), "travelba-mrz-"));
  const sharp = await loadSharp();
  let best: ExtractedIdentity[] = [];
  let bestScore = 0;
  try {
    for (const angle of ROTATIONS) {
      const rotated =
        angle === 0 ? page.image : await sharp(page.image, { failOn: "none" }).rotate(angle).toBuffer();
      const meta = await sharp(rotated, { failOn: "none" }).metadata();
      const width = meta.width || page.width;
      const height = meta.height || page.height;
      let mrz = await readOriented(rotated, width, height, dir, angle);
      if (!mrzPromising(mrz)) continue;
      if (height / width < 1.2) mrz += `\n${await ocrLandscapeName(rotated, width, height, dir, angle)}`;
      const visualMain = await ocrVisual(rotated, width, height, dir, angle);
      const dateBand =
        height / width >= 1.2
          ? bandRect(width, height, 0.66, 0.95)
          : visualRect(width, height);
      let dates = await ocrCrop(rotated, dateBand, dir, `dates-${angle}`, "eng", null, "visual", "11");
      dates += `\n${await ocrCrop(rotated, dateBand, dir, `dates-${angle}-6`, "eng", null, "visual", "6")}`;
      if (dateSheet && angle === 0) {
        dates += `\n${await ocrCrop(
          dateSheet.image,
          bandRect(dateSheet.width, dateSheet.height, 0.66, 0.95),
          dir,
          `pop-dates-${angle}`,
          "eng",
          null,
          "visual",
          "11"
        )}`;
      }
      const placeBand =
        height / width >= 1.2
          ? {
              left: Math.round(width * 0.28),
              top: Math.round(height * 0.55),
              width: Math.max(1, width - Math.round(width * 0.28)),
              height: Math.round(height * 0.32),
            }
          : null;
      const place = placeBand
        ? await ocrCrop(rotated, placeBand, dir, `place-${angle}`, "eng", null, "visual", "11")
        : "";
      const digits = await ocrCrop(
        rotated,
        visualRect(width, height),
        dir,
        `digits-${angle}`,
        "eng",
        "0123456789",
        "digits",
        "11"
      );
      const portrait = height / width >= 1.2;
      const visual = portrait ? `${visualMain}\n${place}` : `${visualMain}\n${dates}\n${place}`;
      const found = identitiesFromPassportOcr(`${mrz}\n${digits}`, visual).filter(
        (identity) => identity.valid && identity.number
      );
      for (const identity of found) {
        if (!identity.issued_on) identity.issued_on = readIssueDate(dates, identity);
      }
      if (!portrait && found.some((identity) => identity.issuing_country === "FR")) {
        const streetBand = bandRect(width, height, 0.48, 0.6);
        const streetText = await ocrCrop(
          rotated,
          streetBand,
          dir,
          `addr-street-${angle}`,
          "eng",
          null,
          "visual",
          "6"
        );
        const streetWide = await ocrCrop(
          rotated,
          streetBand,
          dir,
          `addr-street-wide-${angle}`,
          "eng",
          null,
          "visual",
          "6"
        );
        const postalText = await ocrCrop(
          rotated,
          bandRect(width, height, 0.45, 0.68),
          dir,
          `addr-postal-${angle}`,
          "eng",
          null,
          "visual",
          "6"
        );
        const postalHit = readDomicile(postalText);
        for (const identity of found) {
          if (identity.issuing_country !== "FR") continue;
          const voted = chooseStreet([readDomicile(streetText).address_line, readDomicile(streetWide).address_line], `${streetText}\n${streetWide}`);
          if (voted) identity.address_line = voted;
          if (postalHit.postal_code) {
            identity.postal_code = postalHit.postal_code;
            identity.city = postalHit.city || identity.city;
            identity.country = identity.country || postalHit.country;
          }
        }
      }
      if (!found.length) continue;
      const score = found.reduce(
        (sum, identity) =>
          sum +
          fieldScore(identity) +
          (identity.authority ? 2 : 0) +
          (identity.issued_on ? 1 : 0) +
          (identity.place_of_birth ? 1 : 0) +
          (identity.address_line ? 1 : 0) +
          (identity.first_name || "").length,
        0
      );
      if (score > bestScore) {
        best = found;
        bestScore = score;
      }
    }
    return best;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function scanPassportBytes(
  bytes: Uint8Array,
  type = "",
  name = ""
): Promise<ExtractedIdentity[]> {
  if (!(await tesseractAvailable())) return [];
  const raster = isPdf(type, name)
    ? await rasterPdfPages(bytes)
    : {
        pages: await jpegSize(Buffer.from(bytes)).then((page) => (page ? [page] : [])),
        dateSheets: [] as (PageImage | null)[],
      };
  const found: ExtractedIdentity[] = [];
  for (let i = 0; i < raster.pages.length; i += 1) {
    found.push(...(await scanPage(raster.pages[i], raster.dateSheets[i] || null)));
  }
  return harmonizeFamily(found);
}

function foldPerson(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function harmonizeFamily(rows: ExtractedIdentity[]) {
  const next = rows.map((row) => ({ ...row }));
  for (const row of next) {
    const sibling = next.find(
      (other) =>
        other !== row &&
        other.birth_date &&
        other.birth_date === row.birth_date &&
        (other.last_name || "").length > (row.last_name || "").length
    );
    if (!sibling) continue;
    const own = (row.last_name || "").replace(/[^A-Za-z]/g, "");
    const other = (sibling.last_name || "").replace(/[^A-Za-z]/g, "");
    if (
      other.length >= 6 &&
      other.length > own.length &&
      other.length - own.length <= 4 &&
      other.toUpperCase().endsWith(own.toUpperCase())
    ) {
      row.last_name = sibling.last_name;
    }
    const ownGiven = (row.first_name || "").split(/\s+/).filter(Boolean);
    const otherGiven = (sibling.first_name || "").split(/\s+/).filter(Boolean);
    if (ownGiven.length && ownGiven.length === otherGiven.length) {
      row.first_name = ownGiven
        .map((token, index) => {
          const alt = otherGiven[index];
          if (!alt) return token;
          if (foldPerson(token) === foldPerson(alt)) return alt === foldPerson(alt) ? token : alt;
          if (Math.abs(token.length - alt.length) > 1) return token;
          return alt.length >= token.length ? alt : token;
        })
        .join(" ");
    }
  }
  return next;
}

