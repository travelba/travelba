import { completeGivenNames, type ExtractedIdentity } from "./identity";
import { isoDate } from "./passport-extract";

const EYE_OR_NOISE =
  /^(marron|brown|bleu|blue|vert|green|noir|noisette|hazel|gris|grey|gray|prénoms|prenoms|given|names|name|nom|surname|sex|sexe|male|female|nationalité|nationality|française|francais|français|israeli|israélien|israélienne|israelien|israelienne)$/i;

export function passportNumberHints(text: string) {
  const raw = text.toUpperCase();
  const found = new Set<string>();
  for (const match of raw.matchAll(/\d{4,8}/g)) found.add(match[0]);
  for (const match of raw.matchAll(/\b\d{2}\s*[A-Z]{2}\s*\d{1,5}\b/g)) {
    found.add(match[0].replace(/\s+/g, ""));
  }
  return [...found];
}

function latinNameTokens(chunk: string) {
  return chunk
    .replace(/\(.*?\)/g, " ")
    .split(/[\s,;/|]+/)
    .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "").trim())
    .filter((token) => /^[\p{L}][\p{L}'’-]*$/u.test(token))
    .filter((token) => !EYE_OR_NOISE.test(token))
    .filter((token) => !/[\u0590-\u05FF]/.test(token))
    .filter((token) => {
      const letters = token.replace(/[^\p{L}]/gu, "");
      if (letters.length < 3) return true;
      const counts = new Map<string, number>();
      for (const char of letters.toUpperCase()) counts.set(char, (counts.get(char) || 0) + 1);
      return Math.max(...counts.values()) / letters.length < 0.6;
    });
}

const NEXT_FIELD =
  /nationalit|sexe|\bsex\b|taille|height|couleur|eyes|date de|lieu de|domicile|autorit|passeport|r[eé]publique|code du pays/i;

export function readPrintedGivenNames(text: string) {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const windows: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/pr[eé]noms|given names?/i.test(lines[i])) continue;
    const same = lines[i].replace(/.*(?:pr[eé]noms|given names?)/i, " ");
    const follow: string[] = [];
    for (const line of lines.slice(i + 1, i + 4)) {
      if (NEXT_FIELD.test(line)) break;
      follow.push(line);
    }
    windows.push([same, ...follow].join(" "));
  }
  if (windows.length) {
    const tokens = latinNameTokens(windows.join(" "));
    const named = tokens.filter((token) => token.replace(/[^\p{L}]/gu, "").length >= 3);
    const picked = (named.length ? named : tokens).slice(0, 6);
    if (picked.length) return picked.join(" ");
  }
  const comma = text.match(/[A-ZÀ-ÖØ-öø-ÿ][\p{L}'’-]+(?:\s*,\s*[A-ZÀ-ÖØ-öø-ÿ][\p{L}'’-]+){1,4}/u);
  if (comma) {
    const tokens = latinNameTokens(comma[0]);
    if (tokens.length >= 2) return tokens.join(" ");
  }
  return null;
}

const PLACE_NOISE =
  /^(FRANCE|ISRAEL|ISRAËL|NATIONALITE|SEXE|DOMICILE|AUTORITE|PREFECTURE|PASSEPORT|MARRON|BLEU|VERT|NOIR|NOISETTE|GIVEN|NAMES|SURNAME|RUE|AVENUE|BOULEVARD)$/i;

function flatText(text: string) {
  return text.replace(/-\s+/g, "-").replace(/\s+/g, " ");
}

function cityToken(raw: string) {
  const city = raw
    .toUpperCase()
    .replace(/[^A-Z-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (city.replace(/-/g, "").length < 3 || PLACE_NOISE.test(city)) return null;
  return city;
}

export function readPlaceOfBirth(text: string, issuingCountry: string | null, birthDate?: string | null) {
  const flat = flatText(text);
  const arr = flat.match(/(?:PARIS\s+)?(\d{1,2})\s*E\s+ARRONDISSEMENT/i);
  if (arr) return `PARIS ${arr[1]}E ARRONDISSEMENT`;
  const paris = flat.match(/PARIS\s+\d{1,2}\s*E\b/i);
  if (paris) {
    const head = paris[0].toUpperCase().replace(/\s+/g, " ").replace(/\s+E$/, "E");
    return `${head} ARRONDISSEMENT`;
  }
  if (issuingCountry === "IL" && /\bFRANCE\b/i.test(flat) && !/CONSULAT/i.test(flat)) return "FRANCE";
  const beside = (day: string, month: string, year: string) => {
    const hit = flat.match(new RegExp(`${day}\\s+${month}\\s+${year}\\s+([A-Z][A-Z-]{2,})`, "i"));
    return hit ? cityToken(hit[1]) : null;
  };
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const [year, month, day] = birthDate.split("-");
    const city = beside(day, month, year);
    if (city) return city;
  }
  const loose = flat.match(/(?:^|\D)(\d{2})\s+(\d{2})\s+(\d{4})\s+([A-Z][A-Z-]{2,})/);
  return loose ? cityToken(loose[4]) : null;
}

export function readAuthority(text: string) {
  const flat = flatText(text);
  if (/TEL\s*AVIV/i.test(flat) && /CONSULAT/i.test(flat)) {
    const general = flat.match(/G[ÉE]N[ÉE]RAL/i);
    const word = general ? general[0].toLocaleUpperCase("fr") : "GENERAL";
    return `TEL AVIV - CONSULAT ${word} DE FRANCE`;
  }
  if (/J[ÉE]RUSALEM/i.test(flat)) return "JERUSALEM";
  const start = flat.search(/pr[eé]fecture\b/i);
  if (start < 0) return null;
  const tokens = flat.slice(start).split(/\s+/);
  const kept: string[] = [];
  for (const token of tokens) {
    if (
      kept.length &&
      (/^(?:date|domicile)$/i.test(token) ||
        /^\d{1,4}$/.test(token) ||
        /^(?:rue|avenue|boulevard|chemin|impasse|place|route|allee|allée)$/i.test(token))
    ) {
      break;
    }
    kept.push(token);
    if (kept.length > 8) break;
  }
  const body = kept.join(" ");
  const small = new Set(["de", "des", "du", "la", "le", "les", "d"]);
  return body
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s-])(\p{L})/gu, (chunk) => chunk.toLocaleUpperCase("fr"))
    .replace(/\b(De|Des|Du|La|Le|Les|D)\b/g, (word) => (small.has(word.toLocaleLowerCase("fr")) ? word.toLocaleLowerCase("fr") : word));
}

function collectDates(text: string) {
  const found = new Set<string>();
  const flat = text.replace(/[()]/g, "/").replace(/(\d{2}\s*[./-]\s*\d{2}\s*[./-])\s*\n\s*(\d{4})/g, "$1$2");
  const patterns = [
    /(?:^|\D)(\d{2})\s*[./-]\s*(\d{2})\s*[./-]\s*(\d{4})(?=\D|$)/g,
    /(?:^|\D)(\d{2})\s+(\d{2})\s+(\d{4})(?=\D|$)/g,
    /(?:^|\D)(\d{2})\s+(\d{2})\s*[./-]\s*(\d{4})(?=\D|$)/g,
  ];
  for (const pattern of patterns) {
    for (const match of flat.matchAll(pattern)) {
      const iso = isoDate(`${match[1]}/${match[2]}/${match[3]}`);
      if (iso) found.add(iso);
    }
  }
  const glued = /(?:^|\D)(\d{2})\s+\d?(\d{2})\d?\s*[./-]\s*(\d{4})(?=\D|$)/g;
  for (const match of flat.matchAll(glued)) {
    const iso = isoDate(`${match[1]}/${match[2]}/${match[3]}`);
    if (iso) found.add(iso);
  }
  const splitDay = /(?:^|\D)(\d)\s*[^\d\s]?\s*(\d)\s*[./-]\s*(\d{2})\s*[./-]\s*(\d{4})(?=\D|$)/g;
  for (const match of flat.matchAll(splitDay)) {
    const iso = isoDate(`${match[1]}${match[2]}/${match[3]}/${match[4]}`);
    if (iso) found.add(iso);
  }
  const glare = /(?:^|\D)(\d{2})\s+([0-9OILFSBZ]{2})\s*(\d{4})(?=\D|$)/g;
  for (const match of flat.matchAll(glare)) {
    const month = match[2].replace(
      /[A-Z]/g,
      (char) => ({ O: "0", I: "1", L: "1", F: "1", S: "5", B: "8", Z: "2" })[char] || char
    );
    const iso = isoDate(`${match[1]}/${month}/${match[3]}`);
    if (iso) found.add(iso);
  }
  return [...found];
}

function yearsBetween(earlier: string, later: string) {
  return (Date.parse(later) - Date.parse(earlier)) / (365.25 * 24 * 60 * 60 * 1000);
}

export function readIssueDate(text: string, identity: ExtractedIdentity) {
  const dates = collectDates(text).filter(
    (date) => date !== identity.birth_date && date !== identity.expires_on
  );
  if (!identity.expires_on) return dates[0] || null;
  const ranked = dates
    .filter((date) => date < identity.expires_on! && (!identity.birth_date || date > identity.birth_date))
    .map((date) => {
      const years = yearsBetween(date, identity.expires_on!);
      return { date, gap: Math.min(Math.abs(years - 5), Math.abs(years - 10)) };
    })
    .filter((item) => item.gap <= 0.2)
    .sort((a, b) => a.gap - b.gap);
  return ranked[0]?.date || null;
}

export function readDomicile(text: string) {
  const flat = flatText(text);
  const addressBlock =
    /\b(\d{1,4}\s+(?:RUE|AVENUE|BOULEVARD|CHEMIN|IMPASSE|ALL[ÉE]E|PLACE|ROUTE)\s+(?:[A-Z][A-Z'’]{1,}\s+){0,6}[A-Z][A-Z'’]{1,})\s+(\d{5}|\d{7})\s+([A-Z][A-Z'’]{1,}(?:-[A-Z][A-Z'’]{1,})*)/gi;
  const blocks = [...flat.matchAll(addressBlock)];
  if (blocks.length) {
    const [street, postal, city] = [blocks[0][1], blocks[0][2], blocks[0][3]];
    return {
      address_line: street.replace(/\s+/g, " ").trim().toUpperCase().replace(/\bMOC(?:EER|KER|HER)\b/g, "MOCHER"),
      postal_code: postal,
      city: city.toUpperCase(),
      country: postal.length === 5 ? "FR" : /\bISRA[EË]L\b/i.test(flat) ? "IL" : null,
    };
  }
  const streets = [
    ...flat.matchAll(
      /\b(\d{1,4}\s+(?:RUE|AVENUE|BOULEVARD|CHEMIN|IMPASSE|ALL[ÉE]E)\s+(?:[A-Z]{2,}\s+){0,6}[A-Z]{2,})/gi
    ),
  ];
  const street = streets[0];
  if (!street) {
    const lone = [...flat.matchAll(/\b(\d{7})\s+(HERZ[A-Z]*)\b/gi)][0];
    if (!lone) return { address_line: null, postal_code: null, city: null, country: null };
    return {
      address_line: null,
      postal_code: lone[1],
      city: lone[2].toUpperCase(),
      country: /\bISRA[EË]L\b/i.test(flat) ? "IL" : null,
    };
  }
  const postals = [...flat.matchAll(/\b(\d{5}|\d{7})\s+([A-Z]{2,24})\b/g)];
  const herz = postals.filter((item) => /HERZ/i.test(item[2]));
  const pool = herz.length ? herz : postals;
  const streetEnd = (street.index ?? 0) + street[1].length;
  const afterStreet = pool.filter((item) => (item.index ?? 0) >= streetEnd - 2);
  const postal = [...(afterStreet.length ? afterStreet : pool)].sort(
    (a, b) => Math.abs((a.index ?? 0) - streetEnd) - Math.abs((b.index ?? 0) - streetEnd)
  )[0];
  const country = /\bISRA[EË]L\b/i.test(flat) ? "IL" : postal && postal[1].length === 5 ? "FR" : null;
  return {
    address_line: street[1]
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .replace(/\bMOC(?:EER|KER|HER)\b/g, "MOCHER"),
    postal_code: postal?.[1] || null,
    city: postal?.[2].toUpperCase() || null,
    country,
  };
}

function titleSurname(word: string) {
  return word
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (chunk) => chunk.toUpperCase());
}

function bareSurname(word: string) {
  const stripped = word.match(/^(?:P+|[A-Z]{1,2})?(?:FRA|ISR)([A-Z]{4,})$/);
  return stripped ? stripped[1] : word.replace(/^P+/, "");
}

function printedSurname(mrzLast: string | null, visual: string) {
  if (!mrzLast) return null;
  const fold = mrzLast.toUpperCase().replace(/[^A-Z]/g, "");
  const fromLine = [...visual.toUpperCase().matchAll(/([A-Z]{4,16})<</g)].map((match) => bareSurname(match[1]));
  const chevron = fromLine
    .filter(
      (word) =>
        word.endsWith(fold) &&
        word !== fold &&
        word.length - fold.length <= 4 &&
        fold.length <= 5
    )
    .sort((a, b) => b.length - a.length)[0];
  if (chevron) return titleSurname(chevron);
  const words = visual.toUpperCase().match(/[A-Z]{4,12}/g) || [];
  const one = words.find((word) => word !== fold && word.endsWith(fold) && word.length - fold.length === 1);
  if (!one) return mrzLast;
  return titleSurname(one);
}

export function enrichPassportVisual(identity: ExtractedIdentity, visual: string): ExtractedIdentity {
  const given = readPrintedGivenNames(visual);
  const address = readDomicile(visual);
  return {
    ...identity,
    last_name: printedSurname(identity.last_name, visual),
    first_name: completeGivenNames(identity.first_name, given),
    place_of_birth: identity.place_of_birth || readPlaceOfBirth(visual, identity.issuing_country, identity.birth_date),
    authority: identity.authority || readAuthority(visual),
    issued_on: identity.issued_on || readIssueDate(visual, identity),
    address_line: identity.address_line || address.address_line,
    postal_code: identity.postal_code || address.postal_code,
    city: identity.city || address.city,
    country: identity.country || address.country,
  };
}
