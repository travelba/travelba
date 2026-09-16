import { parse as parseMrz } from "mrz";
import type { MtripGuidePassenger } from "./guide-types";
import {
  normalizeIso3,
  normalizeNationality,
  normalizeSex,
  parseVisualDate,
  passengerCompleteness,
} from "./passenger-schema";

export type ExtractedPassenger = Omit<
  MtripGuidePassenger,
  "id" | "email" | "phone" | "role"
>;

export type PassportParseResult = {
  passengers: ExtractedPassenger[];
  warnings: string[];
  /** ok | partial | failed */
  status: "ok" | "partial" | "failed";
};

function cleanLine(line: string) {
  return line
    .toUpperCase()
    .replace(/[^A-Z0-9<]/g, "")
    .replace(/ /g, "");
}

function yymmddToIso(value?: string | null) {
  if (!value || !/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = value.slice(2, 4);
  const dd = value.slice(4, 6);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Copy bytes — pdf.js must not receive a detached ArrayBuffer. */
function toUint8(data: ArrayBuffer | Uint8Array | Buffer) {
  if (Buffer.isBuffer(data)) return Uint8Array.from(data);
  if (data instanceof Uint8Array) return Uint8Array.from(data);
  return new Uint8Array(data);
}

function cleanMrzName(value: string) {
  return titleCaseName(
    String(value || "")
      .replace(/</g, " ")
      // OCR filler < misread as long runs of C / K / L
      .replace(/\b[ckl]{2,}[a-z]*/gi, " ")
      // trailing single OCR glyph (e.g. "Camille C", "Lea Ll" → strip leftover)
      .replace(/\s+[a-z]$/i, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Reject OCR garbage (passport labels read as names). */
const PASSPORT_LABEL_RE =
  /passaporto|passeport|passport|documento|document|cognome|surname|nom(?:e)?|prenom|pr[eé]nom|given|country|typecode|countrycode|republic|republi|fran[cç]ais|nationalit|autorit|authority|signature|holder|titulaire|mitir|numero|number|code|visa|type|sexe|sex|birth|naissance|expir|deliv/i;

function isPlausiblePersonName(first: string, last: string) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  if (f.length < 2 || l.length < 2) return false;

  for (const token of [...f.split(/\s+/), ...l.split(/\s+/)]) {
    if (token.length > 22) return false;
  }

  const full = `${f} ${l}`;
  if (PASSPORT_LABEL_RE.test(full)) return false;

  // Same long token twice = label echo, not a person
  if (f.toLowerCase() === l.toLowerCase() && f.length > 10) return false;

  // One long glued word (typical OCR on labels)
  if (f.replace(/\s/g, "").length > 18 && f.split(/\s+/).length < 2) return false;
  if (l.replace(/\s/g, "").length > 18 && l.split(/\s+/).length < 2) return false;

  if (full.split(/\s+/).filter(Boolean).length > 6) return false;

  return true;
}

/** OCR confusions fréquentés dans les zones numériques MRZ. */
function ocrDigitFix(ch: string) {
  const map: Record<string, string> = {
    B: "8",
    O: "0",
    Q: "0",
    D: "0",
    S: "5",
    G: "6",
    Z: "2",
    I: "1",
    L: "1",
  };
  return map[ch] || ch;
}

function repairMrzLine1(line: string) {
  let l = line;
  // P< souvent lu PC / P0 / PA
  if (l.startsWith("PC") || l.startsWith("P0") || l.startsWith("PA")) {
    l = `P<${l.slice(2)}`;
  }
  // Remplissage < lu comme C/K/L (runs)
  l = l.replace(/[CLK]{2,}/g, (m) => "<".repeat(m.length));
  // Séparateur << parfois lu « <S » / « <5 » devant le prénom (→ Sjeremy)
  l = l.replace(/<<S(?=[A-Z]{3,})/g, "<<");
  l = l.replace(/<<5(?=[A-Z]{3,})/g, "<<");
  // Séparateur nom/prénom : <K / <KK… souvent à la place de <<
  // (ne pas toucher <L / <S qui peuvent être de vrais prénoms LEA / SAM…)
  l = l.replace(/<K+(?=[A-Z])/g, "<<");
  // Zone filler après les prénoms : à partir du 2e << ou après long run de <
  const firstSep = l.indexOf("<<", 5);
  if (firstSep >= 0) {
    // Chercher fin des prénoms = premier run de <<< (3+)
    const after = l.slice(firstSep + 2);
    const fillerAt = after.search(/<{2,}|[CLK]{2,}/);
    if (fillerAt >= 0) {
      const names = after.slice(0, fillerAt);
      const filler = after
        .slice(fillerAt)
        .replace(/[CLK]/g, "<");
      l = l.slice(0, firstSep + 2) + names + filler;
    }
  }
  return l;
}

/** TD3 ligne 2 : zones dates/n° doivent être numériques. */
function repairMrzLine2(line: string) {
  const l = line.padEnd(44, "<").slice(0, 44);
  const digitZones: Array<[number, number]> = [
    [0, 9], // document number (alphanum — only fix obvious digit lookalikes mid-scan)
    [9, 10], // check
    [13, 20], // birth + check
    [21, 28], // expiry + check
    [28, 44], // personal + checks (mostly < and digits)
  ];
  const chars = l.split("");
  for (const [start, end] of digitZones) {
    for (let i = start; i < end; i++) {
      const c = chars[i];
      if (!c || c === "<") continue;
      if (start === 0 && /[A-Z]/.test(c) && !"BOQDSGZIL".includes(c)) continue;
      if (/[BOQDSGZIL]/.test(c) && (start > 0 || /\d/.test(chars[i + 1] || "") || /\d/.test(chars[i - 1] || ""))) {
        // In doc number: only replace when neighbor suggests digit context
        if (start === 0) {
          const prev = chars[i - 1] || "";
          const next = chars[i + 1] || "";
          if (!/\d/.test(prev) && !/\d/.test(next)) continue;
        }
        chars[i] = ocrDigitFix(c);
      }
    }
  }
  // Nationalité positions 10-12 : garder lettres ; B612 → souvent 8612 si nat=FRA déjà OK
  // Cas fréquent : FRAB612227 → FRA8612227 (B lu pour 8 juste après FRA)
  const nat = chars.slice(10, 13).join("");
  if (/^[A-Z]{3}$/.test(nat)) {
    for (let i = 13; i <= 19; i++) {
      if (/[BOQDSGZIL]/.test(chars[i])) chars[i] = ocrDigitFix(chars[i]);
    }
    for (let i = 21; i <= 27; i++) {
      if (/[BOQDSGZIL]/.test(chars[i])) chars[i] = ocrDigitFix(chars[i]);
    }
  }
  // Sexe pos 20
  if (chars[20] === "P") chars[20] = "F"; // rare OCR
  return chars.join("");
}

function tryParseMrzPair(line1Raw: string, line2Raw: string) {
  let line1 = repairMrzLine1(cleanLine(line1Raw));
  let line2 = repairMrzLine2(cleanLine(line2Raw));

  if (line1.length < 40 || line2.length < 40) return null;
  if (!(line1.startsWith("P<") || line1.startsWith("P0") || line1.startsWith("PA"))) {
    if (line1.startsWith("PC")) line1 = `P<${line1.slice(2)}`;
    else return null;
  }
  if (!/[0-9]/.test(line2)) return null;
  line1 = line1.length < 44 ? line1.padEnd(44, "<") : line1.slice(0, 44);
  line2 = line2.length < 44 ? line2.padEnd(44, "<") : line2.slice(0, 44);

  const candidates = [line2];
  // Variante : forcer correction chiffres sur toute la zone dates
  const forced = line2.split("");
  for (const i of [9, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27]) {
    if (/[A-Z]/.test(forced[i])) forced[i] = ocrDigitFix(forced[i]);
  }
  const forcedStr = forced.join("");
  if (forcedStr !== line2) candidates.push(forcedStr);

  for (const l2 of candidates) {
    try {
      const parsed = parseMrz([line1, l2]);
      const f = parsed.fields;
      if (!f?.lastName && !f?.firstName) continue;
      if (f.nationality && !/^[A-Z]{3}$/.test(String(f.nationality))) continue;
      // Exiger une date de naissance lisible (sinon autre candidat / échec)
      if (f.birthDate && !/^\d{6}$/.test(String(f.birthDate))) continue;
      const first = cleanMrzName(String(f.firstName || ""));
      const last = cleanMrzName(String(f.lastName || ""));
      if (!isPlausiblePersonName(first, last)) continue;
      return parsed;
    } catch {
      // try next
    }
  }
  return null;
}

/** Find TD3 passport MRZ pairs in OCR / PDF text (tolerant to OCR noise). */
export function extractMrzFromText(text: string) {
  const results: Array<ReturnType<typeof parseMrz>> = [];
  const seen = new Set<string>();

  const push = (parsed: ReturnType<typeof parseMrz>) => {
    const key = `${parsed.fields?.documentNumber}|${parsed.fields?.lastName}|${parsed.fields?.firstName}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(parsed);
  };

  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const cleaned = rawLines.map(cleanLine).filter((l) => l.length >= 28);

  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < Math.min(i + 5, cleaned.length); j++) {
      const parsed = tryParseMrzPair(cleaned[i], cleaned[j]);
      if (parsed) push(parsed);
    }
  }

  // OCR sometimes concatenates lines — search sliding 44+44 windows
  const compact = cleanLine(text.replace(/\s+/g, ""));
  for (let i = 0; i < compact.length - 80; i++) {
    if (!(compact[i] === "P" && (compact[i + 1] === "<" || compact[i + 1] === "0"))) {
      continue;
    }
    const line1 = compact.slice(i, i + 44);
    const line2 = compact.slice(i + 44, i + 88);
    const parsed = tryParseMrzPair(line1, line2);
    if (parsed) push(parsed);
  }

  return results;
}

/**
 * Date de délivrance : absente de la MRZ — uniquement zone visuelle.
 * Heuristique si le label OCR est manqué : date ≠ naissance / expiration.
 */
function extractIssuedDateHeuristic(
  text: string,
  birth?: string | null,
  expiry?: string | null
): string | null {
  const found: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    const iso = parseVisualDate(raw);
    if (!iso || seen.has(iso)) return;
    if (iso === birth || iso === expiry) return;
    seen.add(iso);
    found.push(iso);
  };

  for (const m of text.matchAll(
    /(\d{1,2}[./\-\s]+\d{1,2}[./\-\s]+\d{2,4})|\b(\d{8})\b/g
  )) {
    push(m[0]);
  }

  if (!found.length) return null;

  // Préférer une date entre naissance et expiration (passeport FR typique)
  if (birth && expiry) {
    const between = found.find((d) => d > birth && d < expiry);
    if (between) return between;
  }
  // Sinon la plus récente avant expiration / aujourd’hui
  const today = new Date().toISOString().slice(0, 10);
  const beforeExp = found
    .filter((d) => (!expiry || d < expiry) && d <= today)
    .sort();
  return beforeExp[beforeExp.length - 1] || found[0];
}

/** Zone visuelle FR / EN / IT (fallback si MRZ illisible). */
export function extractVisualZone(text: string) {
  const nom =
    text.match(
      /(?:Nom|Surname|Cognome|NOM)\s*[:\n/]\s*([A-ZÀ-Ÿa-zà-ÿ\- ]{2,40})/i
    )?.[1] || text.match(/\bNOM\s+([A-ZÀ-Ÿ\- ]{2,40})/i)?.[1];
  const prenoms =
    text.match(
      /(?:Pr[eé]noms?|Given names?|PRENOMS?|Nome)\s*[:\n/]\s*([A-ZÀ-Ÿa-zà-ÿ\- ]{2,80})/i
    )?.[1] || text.match(/\bPRENOM(?:S)?\s+([A-ZÀ-Ÿ\- ]{2,80})/i)?.[1];
  const number =
    text.match(
      /(?:N[°o]|No\.?|Passport No\.?|Document No\.?|Passaporto)\s*[:\s]*([A-Z0-9]{6,12})/i
    )?.[1] ||
    text.match(/\b([0-9]{2}[A-Z]{2}[0-9]{5})\b/)?.[1];
  const birthDate =
    parseVisualDate(
      text.match(
        /(?:Date de naissance|Date of birth|Data di nascita|N[eé]\(e\)\s+le)\s*[:\s]*(\d{1,2}[./\-\s]\d{1,2}[./\-\s]\d{2,4})/i
      )?.[1]
    ) ||
    parseVisualDate(text.match(/\b(\d{2}\s+\d{2}\s+\d{4})\b/)?.[1]) ||
    parseVisualDate(text.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}\b/)?.[0]);

  const birthPlaceRaw =
    text
      .match(
        /(?:Lieu de naissance|Place of birth|Luogo di nascita)\s*[:\s/]*([A-ZÀ-Ÿa-zà-ÿ0-9\s,'\-]{3,60})/i
      )?.[1]
      ?.trim() ||
    text
      .match(
        /(?:Lieude\s*naissance|Luogodi\s*nascita)\s*[:\s/]*([A-ZÀ-Ÿa-zà-ÿ0-9\s,'\-]{3,60})/i
      )?.[1]
      ?.trim() ||
    text.match(/\bB?([A-Z]{4,}(?:\s+\d{1,2}E)?\s+ARRONDISSEMENT)\b/i)?.[1]?.trim() ||
    text.match(/\bB?(PARIS\s+\d{1,2}\s*E(?:\s+ARRONDISSEMENT)?)\b/i)?.[1]?.trim() ||
    text.match(/\b(PARIS)\b/i)?.[1]?.trim() ||
    null;

  const birthPlace = birthPlaceRaw
    ? titleCaseName(birthPlaceRaw.replace(/^B(?=PARIS)/i, ""))
    : null;

  const sex = normalizeSex(
    text.match(/(?:Sexe|Sex|SESSO)\s*[:\s]*([A-Z]{3,6}|[MF])/i)?.[1]
  );
  const expiry =
    parseVisualDate(
      text.match(
        /(?:Date\s*d['']?\s*expiration|Date\s*of\s*expir(?:y|ation)|Scadenza)[^\d]{0,48}(\d{1,2}[./\-\s]+\d{1,2}[./\-\s]+\d{2,4}|\d{8})/i
      )?.[1]
    ) ||
    parseVisualDate(
      text.match(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20[2-9]\d)\b/)?.[0]
    );

  const issued =
    parseVisualDate(
      text.match(
        /(?:Date\s*de\s*d[eé]livrance|Date\s*of\s*issue|Data\s*di\s*rilascio|D[eé]livrance|Dateded[eé]livrance|Dateofissue)[^\d]{0,48}(\d{1,2}[./\-\s]+\d{1,2}[./\-\s]+\d{2,4}|\d{8})/i
      )?.[1]
    ) ||
    // OCR sans label clair : 3e date visuelle ≠ naissance / expiration
    extractIssuedDateHeuristic(text, birthDate, expiry);
  const nationalityRaw =
    text.match(
      /(?:Nationalit[eé]|Nationality|Nacionalit[aà])\s*[:\s]*([A-ZÀ-Ÿa-zà-ÿ\s\-]{3,30})/i
    )?.[1]?.trim() ||
    text.match(/\b(Fran[cç]aise|Francaise|French)\b/i)?.[1] ||
    null;

  // Même sans labels Nom/Prénom, garder lieu / dates (souvent seuls champs encore lisibles)
  if (
    !nom &&
    !prenoms &&
    !birthPlace &&
    !birthDate &&
    !issued &&
    !expiry &&
    !number &&
    !nationalityRaw
  ) {
    return null;
  }

  const givenParts = (prenoms || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => titleCaseName(p));

  return {
    last_name: nom ? titleCaseName(nom) : "",
    first_name: givenParts[0] || "",
    middle_names: givenParts.slice(1).join(" ") || null,
    passport_number: number || null,
    birth_date: birthDate,
    birth_place: birthPlace,
    sex,
    passport_expiry: expiry,
    passport_issued_date: issued,
    nationality: normalizeNationality(nationalityRaw) || nationalityRaw,
    issuing_country: normalizeNationality(nationalityRaw),
  };
}

type VisualZone = NonNullable<ReturnType<typeof extractVisualZone>>;

/** Fusionne MRZ + zone visuelle pour remplir tous les champs billet/visa. */
function enrichFromVisual(
  p: ExtractedPassenger,
  visual: VisualZone | null
): ExtractedPassenger {
  if (!visual) return finalizePassenger(p);

  const nationality =
    p.nationality ||
    normalizeNationality(visual.nationality) ||
    normalizeIso3(visual.nationality);

  return finalizePassenger({
    ...p,
    first_name: p.first_name || visual.first_name,
    last_name: p.last_name || visual.last_name,
    middle_names: p.middle_names || visual.middle_names,
    passport_number: p.passport_number || visual.passport_number,
    nationality,
    issuing_country:
      p.issuing_country || p.nationality || nationality || visual.issuing_country,
    birth_date: p.birth_date || visual.birth_date,
    birth_place: p.birth_place || visual.birth_place,
    passport_expiry: p.passport_expiry || visual.passport_expiry,
    passport_issued_date: p.passport_issued_date || visual.passport_issued_date,
    sex: p.sex || visual.sex,
  });
}

function finalizePassenger(p: ExtractedPassenger): ExtractedPassenger {
  const nationality = normalizeNationality(p.nationality) || normalizeIso3(p.nationality);
  const issuing =
    normalizeIso3(p.issuing_country) ||
    p.issuing_country ||
    nationality ||
    null;
  const { complete } = passengerCompleteness({
    ...p,
    nationality,
  });
  return {
    ...p,
    nationality,
    issuing_country: issuing,
    sex: normalizeSex(p.sex) || p.sex,
    import_status: complete ? "complete" : "review",
  };
}

/** @deprecated use extractVisualZone */
export const extractFrenchVisualZone = extractVisualZone;

export function mrzToPassenger(
  parsed: ReturnType<typeof parseMrz>,
  sourceFile?: string
): ExtractedPassenger {
  const f = parsed.fields;
  const givenRaw = String(f.firstName || "").replace(/</g, " ");
  const givenParts = givenRaw
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => cleanMrzName(p))
    .filter(Boolean);

  return {
    first_name: givenParts[0] || cleanMrzName(givenRaw),
    middle_names: givenParts.slice(1).join(" ") || null,
    last_name: cleanMrzName(String(f.lastName || "").replace(/</g, " ")),
    language: "fr",
    passport_number: f.documentNumber || null,
    nationality: normalizeIso3(f.nationality) || f.nationality || null,
    issuing_country: normalizeIso3(f.issuingState) || f.issuingState || null,
    birth_date: yymmddToIso(f.birthDate),
    birth_place: null,
    passport_expiry: yymmddToIso(f.expirationDate),
    passport_issued_date: null,
    sex: normalizeSex(f.sex) || f.sex || null,
    source_file: sourceFile || null,
    import_status: "review",
    import_warnings: [],
  };
}

async function textFromPdfLayer(data: ArrayBuffer | Uint8Array | Buffer) {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(toUint8(data), {
    mergePages: true,
  });
  return Array.isArray(text) ? text.join("\n") : String(text || "");
}

async function ocrImageBuffer(
  image: Buffer | ArrayBuffer | Uint8Array,
  opts?: { mrzMode?: boolean; alreadyNormalized?: boolean }
) {
  const normalized = opts?.alreadyNormalized
    ? Buffer.from(toUint8(image))
    : await normalizeImageForOcr(Buffer.from(toUint8(image)));
  if (!normalized) return "";

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    if (opts?.mrzMode) {
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      });
    }
    const {
      data: { text },
    } = await worker.recognize(normalized);
    return text || "";
  } catch {
    return "";
  } finally {
    await worker.terminate();
  }
}

/** Re-encode via sharp so Tesseract never sees corrupt PDF JPEG fragments. */
async function normalizeImageForOcr(input: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(input, { failOn: "none", animated: false });
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 80 || meta.height < 80) {
      return null;
    }
    return await img
      .rotate() // honor EXIF orientation
      .resize({
        width: 2200,
        height: 2200,
        fit: "inside",
        withoutEnlargement: false,
      })
      .normalize()
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

async function ocrOrientedPage(oriented: Buffer) {
  const chunks: string[] = [
    await ocrImageBuffer(oriented, { alreadyNormalized: true }),
  ];
  const sharp = (await import("sharp")).default;
  const meta = await sharp(oriented).metadata();
  const h = meta.height || 0;
  const w = meta.width || 0;
  if (h >= 120 && w >= 120) {
    const top = Math.floor(h * 0.7);
    const mrzStrip = await sharp(oriented)
      .extract({ left: 0, top, width: w, height: h - top })
      .greyscale()
      .normalize()
      .png()
      .toBuffer();
    chunks.push(
      await ocrImageBuffer(mrzStrip, {
        mrzMode: true,
        alreadyNormalized: true,
      })
    );
  }
  return chunks.filter(Boolean).join("\n");
}

async function ocrPngWithMrzStrip(full: Buffer) {
  const base = await normalizeImageForOcr(full);
  if (!base) return "";

  const sharp = (await import("sharp")).default;
  const meta = await sharp(base).metadata();
  const h = meta.height || 0;
  const w = meta.width || 0;

  // Photo passeport ouvert (page signature + page identité) : cadrer le bas
  const crops: Buffer[] = [base];
  if (h > w * 1.15 && h >= 400) {
    const lower = await sharp(base)
      .extract({
        left: 0,
        top: Math.floor(h * 0.42),
        width: w,
        height: h - Math.floor(h * 0.42),
      })
      .png()
      .toBuffer();
    crops.unshift(lower);
  }

  const texts: string[] = [];
  let best = "";
  let bestScore = -999;

  for (const crop of crops) {
    const upright = await ocrOrientedPage(crop);
    texts.push(upright);
    let p = bestPassengerFromText(upright, "x");
    let s = p ? scorePassenger(p) : -999;
    if (s > bestScore) {
      bestScore = s;
      best = upright;
    }

    // Si déjà solide, on saute les rotations (coûteuses) mais on garde
    // les autres crops pour la zone visuelle (lieu / délivrance).
    if (isStrongPassenger(p)) continue;

    for (const angle of [180, 90, 270]) {
      const oriented = await sharp(crop).rotate(angle).png().toBuffer();
      const text = await ocrOrientedPage(oriented);
      texts.push(text);
      p = bestPassengerFromText(text, "x");
      s = p ? scorePassenger(p) : -999;
      if (s > bestScore) {
        bestScore = s;
        best = text;
      }
    }
  }

  // Fusionner pour récupérer lieu de naissance / dates hors MRZ
  const combined = [...new Set(texts.filter(Boolean))].join("\n");
  const combinedScore = (() => {
    const p = bestPassengerFromText(combined, "x");
    return p ? scorePassenger(p) : -999;
  })();

  return combinedScore >= bestScore ? combined : [best, combined].filter(Boolean).join("\n");
}

/** Direct OCR on a rendered passport page (no aggressive resize — keeps MRZ sharp). */
async function ocrRenderedPassportPage(png: Buffer) {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(png, { failOn: "none" }).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 100 || h < 100) return "";

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const full = await worker.recognize(png);
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    });
    const strip = await sharp(png)
      .extract({
        left: 0,
        top: Math.floor(h * 0.68),
        width: w,
        height: h - Math.floor(h * 0.68),
      })
      .greyscale()
      .normalize()
      .png()
      .toBuffer();
    const mrz = await worker.recognize(strip);
    return [full.data.text || "", mrz.data.text || ""].join("\n");
  } catch {
    return "";
  } finally {
    await worker.terminate();
  }
}

/** OCR page par page — un PDF multi-passeports (ex. famille) → N voyageurs. */
async function passengersFromScannedPdf(
  data: ArrayBuffer | Uint8Array | Buffer,
  fileName: string,
  warnings: string[]
): Promise<ExtractedPassenger[]> {
  const bytes = toUint8(data);
  const batches: ExtractedPassenger[][] = [];
  const errors: string[] = [];
  const MAX_PAGES = 20;

  try {
    const { definePDFJSModule, getDocumentProxy, renderPageAsImage } =
      await import("unpdf");
    await definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
    const pdf = await getDocumentProxy(bytes);
    const pages = Math.min(pdf.numPages || 1, MAX_PAGES);
    if ((pdf.numPages || 1) > MAX_PAGES) {
      warnings.push(
        `${fileName}: ${pdf.numPages} pages — seules les ${MAX_PAGES} premières sont lues.`
      );
    }

    for (let page = 1; page <= pages; page++) {
      try {
        const png = Buffer.from(
          new Uint8Array(
            await renderPageAsImage(pdf, page, {
              canvasImport: () => import("@napi-rs/canvas"),
              scale: 3,
            })
          )
        );
        const text = await ocrRenderedPassportPage(png);
        if (!text.trim()) continue;
        const pageLabel = `${fileName} (p.${page})`;
        const hit = passengersFromText(text, pageLabel, warnings);
        if (hit?.passengers.length) {
          batches.push(
            hit.passengers.map((p) => ({
              ...p,
              source_file: fileName,
            }))
          );
        }
      } catch (err) {
        errors.push(
          `p.${page}: ${err instanceof Error ? err.message : "OCR"}`
        );
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "canvas");
  }

  let merged = mergePassportPassengers(batches);
  if (merged.length) {
    if (merged.length > 1) {
      warnings.push(
        `${fileName}: ${merged.length} passeports détectés dans le PDF.`
      );
    }
    return merged;
  }

  // Fallback : images embarquées / extractImages (anciens PDF)
  try {
    const attempts: string[] = [];
    for (const img of await extractEmbeddedImagesFromPdf(bytes)) {
      const text = await ocrPngWithMrzStrip(img);
      if (text.trim()) attempts.push(text);
    }
    try {
      const { definePDFJSModule, getDocumentProxy, extractImages } =
        await import("unpdf");
      await definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
      const pdf = await getDocumentProxy(bytes);
      const sharp = (await import("sharp")).default;
      for (let page = 1; page <= Math.min(pdf.numPages || 1, MAX_PAGES); page++) {
        for (const img of await extractImages(pdf, page)) {
          if (img.width < 200 || img.height < 200) continue;
          const png = await sharp(Buffer.from(img.data), {
            raw: {
              width: img.width,
              height: img.height,
              channels: img.channels,
            },
            failOn: "none",
          })
            .png()
            .toBuffer();
          const text = await ocrPngWithMrzStrip(png);
          if (text.trim()) attempts.push(text);
        }
      }
    } catch {
      // ignore
    }

    for (const text of attempts) {
      const hit = passengersFromText(text, fileName, warnings);
      if (hit?.passengers.length) batches.push(hit.passengers);
    }
    merged = mergePassportPassengers(batches);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "embedded");
  }

  if (!merged.length && errors.length) {
    throw new Error(`OCR PDF impossible (${errors.join(" · ")})`);
  }
  return merged;
}

async function extractEmbeddedImagesFromPdf(
  data: Uint8Array
): Promise<Buffer[]> {
  const candidates: Buffer[] = [];
  const pushUnique = (buf: Buffer) => {
    if (buf.length < 20_000) return;
    if (candidates.some((b) => b.length === buf.length)) return;
    candidates.push(buf);
  };

  // Prefer DCTDecode streams (real PDF image objects)
  const asText = Buffer.from(data).toString("latin1");
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(asText))) {
    const before = asText.slice(Math.max(0, m.index - 400), m.index);
    if (!/DCTDecode/i.test(before)) continue;
    const raw = Buffer.from(m[1], "latin1");
    // Trim to JPEG SOI..EOI if present
    const soi = raw.indexOf(Buffer.from([0xff, 0xd8]));
    const eoi = raw.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (soi >= 0 && eoi > soi) {
      pushUnique(raw.subarray(soi, eoi + 2));
    }
  }

  // Fallback: scan for JPEG/PNG signatures (validate later)
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === 0xd8) {
      for (let j = i + 2; j < data.length - 1; j++) {
        if (data[j] === 0xff && data[j + 1] === 0xd9) {
          pushUnique(Buffer.from(data.subarray(i, j + 2)));
          i = j + 1;
          break;
        }
      }
    }
    if (
      data[i] === 0x89 &&
      data[i + 1] === 0x50 &&
      data[i + 2] === 0x4e &&
      data[i + 3] === 0x47
    ) {
      for (let j = i + 8; j < data.length - 7; j++) {
        if (
          data[j] === 0x49 &&
          data[j + 1] === 0x45 &&
          data[j + 2] === 0x4e &&
          data[j + 3] === 0x44
        ) {
          pushUnique(Buffer.from(data.subarray(i, j + 8)));
          i = j + 7;
          break;
        }
      }
    }
  }

  const valid: Buffer[] = [];
  for (const c of candidates.sort((a, b) => b.length - a.length).slice(0, 6)) {
    const ok = await normalizeImageForOcr(c);
    if (ok) valid.push(ok);
  }
  return valid.slice(0, 3);
}

async function textFromImage(data: ArrayBuffer | Uint8Array | Buffer) {
  return ocrPngWithMrzStrip(Buffer.from(toUint8(data)));
}

function scorePassenger(
  p: PassportParseResult["passengers"][number]
) {
  let score = 0;
  if (p.first_name) score += 1;
  if (p.last_name) score += 1;
  if (p.nationality && /^[A-Z]{3}$/.test(p.nationality)) score += 3;
  if (p.birth_date) score += 3;
  if (p.passport_expiry) score += 2;
  if (p.passport_number && /^[A-Z0-9]{6,12}$/i.test(p.passport_number)) score += 2;
  if (p.sex) score += 1;
  // Penalize OCR garbage left in names
  const first = p.first_name || "";
  const last = p.last_name || "";
  const name = `${first} ${last}`;
  if (/[ckl]{3,}/i.test(name)) score -= 5;
  if (first.length > 0 && first.length <= 2) score -= 4;
  // Prénom OCR avec S parasite (Sjeremy)
  if (/^s[a-z]{4,}$/i.test(first)) score -= 2;
  if (last.split(/\s+/).filter(Boolean).length >= 3) score -= 6;
  if (/sfabien|sultans|passeport|countrycode|typecode|codedupays|passaporto|mitirpass/i.test(name)) {
    score -= 8;
  }
  if (!isPlausiblePersonName(first, last)) score -= 20;
  return score;
}

function bestPassengerFromText(text: string, fileName: string) {
  const mrzList = extractMrzFromText(text);
  if (!mrzList.length) return null;
  const passengers = mrzList
    .map((m) => mrzToPassenger(m, fileName))
    .sort((a, b) => scorePassenger(b) - scorePassenger(a));
  return passengers[0] || null;
}

function isStrongPassenger(
  p: PassportParseResult["passengers"][number] | null
) {
  if (!p) return false;
  const first = p.first_name || "";
  const last = p.last_name || "";
  if (!isPlausiblePersonName(first, last)) return false;
  if (first.length < 3 || last.length < 2) return false;
  if (last.split(/\s+/).filter(Boolean).length >= 3) return false;
  if (/[ckl]{3,}/i.test(`${first} ${last}`)) return false;
  return (
    scorePassenger(p) >= 9 &&
    Boolean(p.passport_number && p.nationality && p.birth_date)
  );
}

function namesNearDuplicate(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-zà-ÿ]/gi, "");
  const nb = b.toLowerCase().replace(/[^a-zà-ÿ]/gi, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [longer, shorter] =
    na.length >= nb.length ? [na, nb] : [nb, na];
  // « Sjeremy » vs « Jeremy » — 1–2 lettres en trop devant
  if (
    longer.length - shorter.length <= 2 &&
    longer.endsWith(shorter) &&
    shorter.length >= 4
  ) {
    return true;
  }
  if (Math.abs(na.length - nb.length) <= 1 && levenshtein(na, nb) <= 1) {
    return true;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/** Garde le meilleur passager par identité (n° passeport ou noms quasi-identiques). */
function collapsePassengers(
  list: PassportParseResult["passengers"]
): PassportParseResult["passengers"] {
  const sorted = [...list].sort(
    (a, b) => scorePassenger(b) - scorePassenger(a)
  );
  const out: PassportParseResult["passengers"] = [];
  for (const p of sorted) {
    const dupIdx = out.findIndex((o) => {
      if (
        p.passport_number &&
        o.passport_number &&
        p.passport_number.toUpperCase() === o.passport_number.toUpperCase()
      ) {
        return true;
      }
      const sameLast =
        (p.last_name || "").toLowerCase().trim() ===
        (o.last_name || "").toLowerCase().trim();
      if (sameLast && namesNearDuplicate(p.first_name || "", o.first_name || "")) {
        return true;
      }
      return false;
    });
    if (dupIdx < 0) out.push(p);
  }
  return out;
}

function passengersFromText(text: string, fileName: string, warnings: string[]) {
  const visual = extractVisualZone(text);
  const mrzList = extractMrzFromText(text);

  if (mrzList.length) {
    const passengers = mrzList
      .map((m) => enrichFromVisual(mrzToPassenger(m, fileName), visual))
      .filter((p) => isPlausiblePersonName(p.first_name, p.last_name))
      .sort((a, b) => scorePassenger(b) - scorePassenger(a));
    if (passengers.length) {
      // OCR produit souvent N « MRZ » fantômes (Jeremy / Sjeremy / …) → 1 identité
      const unique = collapsePassengers(passengers);
      return { passengers: unique, warnings };
    }
    warnings.push(
      `${fileName}: MRZ détectée mais noms illisibles — vérifiez le scan ou saisissez à la main.`
    );
  }

  if (
    visual &&
    (visual.first_name || visual.last_name) &&
    isPlausiblePersonName(visual.first_name, visual.last_name)
  ) {
    warnings.push(
      `${fileName}: MRZ non lue — zone visuelle utilisée (vérifier les champs).`
    );
    return {
      passengers: [
        finalizePassenger({
          first_name: visual.first_name,
          last_name: visual.last_name,
          middle_names: visual.middle_names,
          language: "fr",
          passport_number: visual.passport_number,
          nationality: visual.nationality,
          issuing_country: visual.issuing_country,
          birth_date: visual.birth_date,
          birth_place: visual.birth_place,
          passport_expiry: visual.passport_expiry,
          passport_issued_date: visual.passport_issued_date,
          sex: visual.sex,
          source_file: fileName,
          import_warnings: [],
        }),
      ],
      warnings,
    };
  }

  return null;
}

function resultStatus(
  passengers: ExtractedPassenger[],
  warnings: string[]
): PassportParseResult["status"] {
  if (!passengers.length) return "failed";
  const complete = passengers.every(
    (p) =>
      p.passport_number &&
      p.nationality &&
      p.birth_date &&
      p.passport_expiry &&
      p.sex
  );
  if (complete && !warnings.length) return "ok";
  return "partial";
}

function wrapResult(
  passengers: ExtractedPassenger[],
  warnings: string[]
): PassportParseResult {
  return {
    passengers,
    warnings,
    status: resultStatus(passengers, warnings),
  };
}

export async function parsePassportFile(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType?: string
): Promise<PassportParseResult> {
  const warnings: string[] = [];
  const lower = fileName.toLowerCase();
  const isPdf =
    mimeType?.includes("pdf") || lower.endsWith(".pdf");
  const isImage =
    mimeType?.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(fileName);

  // Own a stable copy up-front (PDF.js / workers can detach the original)
  const owned = Buffer.from(toUint8(buffer));

  try {
    if (isPdf) {
      let text = "";
      try {
        text = await textFromPdfLayer(owned);
      } catch (err) {
        warnings.push(
          `${fileName}: couche texte PDF illisible (${err instanceof Error ? err.message : "erreur"})`
        );
      }

      const hit = text.trim() ? passengersFromText(text, fileName, warnings) : null;
      if (hit?.passengers.length) return wrapResult(hit.passengers, hit.warnings);

      // Scanned PDF multi-pages : 1 page = potentiellement 1 passeport
      try {
        const scanned = await passengersFromScannedPdf(
          owned,
          fileName,
          warnings
        );
        if (scanned.length) return wrapResult(scanned, warnings);
      } catch (err) {
        warnings.push(
          `${fileName}: OCR PDF impossible (${err instanceof Error ? err.message : "erreur"})`
        );
        return wrapResult([], warnings);
      }

      warnings.push(
        `${fileName}: passeport non reconnu — photo JPG nette de la page MRZ recommandée, ou PDF multi-pages avec une page par passeport.`
      );
      return wrapResult([], warnings);
    }

    if (isImage) {
      const text = await textFromImage(owned);
      const hit = text.trim() ? passengersFromText(text, fileName, warnings) : null;
      if (hit?.passengers.length) {
        // Une photo = un passeport (pas N MRZ fantômes OCR)
        const best = collapsePassengers(hit.passengers)[0];
        return wrapResult(best ? [best] : [], hit.warnings);
      }
      warnings.push(
        `${fileName}: passeport non reconnu — cadrez la page avec les 2 lignes MRZ en bas.`
      );
      return wrapResult([], warnings);
    }

    // unknown type: try PDF then image
    try {
      const text = await textFromPdfLayer(owned);
      const hit = text.trim() ? passengersFromText(text, fileName, warnings) : null;
      if (hit?.passengers.length) return wrapResult(hit.passengers, hit.warnings);
    } catch {
      // continue
    }
    const text = await textFromImage(owned);
    const hit = text.trim() ? passengersFromText(text, fileName, warnings) : null;
    if (hit?.passengers.length) return wrapResult(hit.passengers, hit.warnings);

    warnings.push(`${fileName}: format non reconnu (PDF, JPG, PNG, WEBP, HEIC).`);
    return wrapResult([], warnings);
  } catch (err) {
    warnings.push(
      `${fileName}: lecture impossible (${err instanceof Error ? err.message : "erreur"})`
    );
    return wrapResult([], warnings);
  }
}

export function mergePassportPassengers(
  batches: PassportParseResult["passengers"][]
): PassportParseResult["passengers"] {
  const flat: PassportParseResult["passengers"] = [];
  for (const batch of batches) {
    for (const p of batch) {
      if (!p.first_name && !p.last_name) continue;
      flat.push(p);
    }
  }
  return collapsePassengers(flat);
}
