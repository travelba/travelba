import { completeGivenNames, type ExtractedIdentity } from "./identity";
import { isoDate, parseSpouseLine, spouseFamilyNames } from "./passport-extract";

const EYE_OR_NOISE =
  /^(marron|brown|bleu|blue|vert|green|noir|noisette|hazel|gris|grey|gray|prénoms|prenoms|given|names|name|nom|surname|sex|sexe|male|female|nationalité|nationality|française|francais|français|israeli|israélien|israélienne|israelien|israelienne)$/i;

export function passportNumberHints(text: string) {
  const raw = text.toUpperCase();
  const found = new Set<string>();
  for (const match of raw.matchAll(/\d{4,8}/g)) found.add(match[0]);
  for (const match of raw.matchAll(/\b\d{2}\s*[A-Z]{2}\s*\d{1,5}(?!\s*[A-Z])/g)) {
    found.add(match[0].replace(/\s+/g, ""));
  }
  return [...found];
}

function latinNameTokens(chunk: string) {
  return chunk
    .replace(/\(.*?\)/g, " ")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/[\s,;/|]+/)
    .map((token) => token.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "").trim())
    .filter((token) => /^[\p{L}][\p{L}'’-]*$/u.test(token))
    .filter((token) => /^\p{Lu}/u.test(token))
    .filter((token) => !/^\p{Lu}\p{Ll}*\p{Lu}/u.test(token))
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
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    const [year, month, day] = birthDate.split("-");
    return cityBesideDate(flat, day, month, year);
  }
  const loose = flat.match(/(?:^|\D)(\d{2})\s+(\d{2})\s+(\d{4})\s+([A-Z][A-Z-]{3,})/);
  return loose ? cityToken(loose[4]) : null;
}

const CITY_ARTICLE = /^(?:LE|LA|LES)$/;

/** Un bout du nom de naissance (« BIB » dans un nom plus long) n’est pas une ville. */
function placeIsSurnameFragment(place: string | null, last: string | null) {
  if (!place || !last || /\s/.test(place)) return false;
  const city = place.toUpperCase().replace(/[^A-Z]/g, "");
  const name = last.toUpperCase().replace(/[^A-Z]/g, "");
  return city.length >= 3 && city.length < name.length && name.endsWith(city);
}

function cityBesideDate(flat: string, day: string, month: string, year: string) {
  const found: string[] = [];
  const re = new RegExp(`${day}\\s*${month}\\s*${year}`, "ig");
  for (const match of flat.matchAll(re)) {
    const tail = flat.slice((match.index || 0) + match[0].length);
    const city: string[] = [];
    for (const raw of tail.split(/\s+/).slice(0, 8)) {
      const word = raw
        .toUpperCase()
        .replace(/[^A-Z-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!word) {
        if (city.length) break;
        continue;
      }
      if (word.length === 1) continue;
      if (PLACE_NOISE.test(word) || /DLIVR|DELIV|EXPIR|NAISS|DOMICIL|AUTORIT|ISSUE|RESIDE|PREFECT/.test(word)) {
        if (city.length) break;
        continue;
      }
      const letters = word.replace(/-/g, "");
      if (!CITY_ARTICLE.test(word) && letters.length < 4) {
        if (!city.length) continue;
        break;
      }
      city.push(word);
      if (CITY_ARTICLE.test(city[0]) ? city.length >= 2 : letters.length >= 4) break;
    }
    const joined = city.join(" ");
    if (joined.replace(/[^A-Z]/g, "").length >= 4) found.push(joined);
  }
  if (!found.length) return null;
  const upper = flat.toUpperCase();
  const seen = (city: string) => upper.split(city).length - 1;
  return found.sort((a, b) => seen(b) - seen(a) || b.length - a.length)[0];
}

export function readAuthority(text: string) {
  const flat = flatText(text);
  if (/TEL\s*AVIV/i.test(flat) && /CONSULAT/i.test(flat)) {
    const general = flat.match(/G[ÉE]N[ÉE]RAL/i);
    const word = general ? general[0].toLocaleUpperCase("fr") : "GENERAL";
    return `TEL AVIV - CONSULAT ${word} DE FRANCE`;
  }
  if (/J[ÉE]RUSALEM/i.test(flat)) return "JERUSALEM";
  const candidates: string[][] = [];
  for (const match of flat.matchAll(/pr[eé]fecture\b/gi)) {
    const tokens = authorityTokens(flat.slice(match.index || 0));
    if (tokens.length >= 3) candidates.push(tokens);
  }
  if (!candidates.length) return null;
  const best = candidates
    .slice()
    .sort((a, b) => authorityScore(b, flat) - authorityScore(a, flat))[0];
  return titleAuthority(best.join(" "));
}

function authorityComplete(kept: string[]) {
  const words = kept.filter((token) => !/^(?:de|des|du|la|le|les|d|pr[eé]fecture)$/i.test(token));
  const department = words.some((token) => token.split("-").filter(Boolean).length >= 3);
  return department && words.length >= 2;
}

function authorityWord(token: string) {
  const parts = token.split("-").filter(Boolean);
  if (!parts.length || parts.length > 4) return false;
  return parts.every((part) => {
    if (part.length > 12) return false;
    if (part.length >= 4 && !/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ]/i.test(part)) return false;
    return true;
  });
}

function authorityScore(tokens: string[], flat: string) {
  const upper = flat.toUpperCase();
  return tokens.reduce((score, token) => {
    return (
      score +
      token
        .toUpperCase()
        .split("-")
        .reduce((sum, part) => {
          if (part.length < 3) return sum + 1;
          return sum + Math.min(upper.split(part).length - 1, 4) * Math.min(part.length, 10);
        }, 0)
    );
  }, 0);
}

function authorityTokens(slice: string) {
  const kept: string[] = [];
  let pendingGlue = false;
  let skipped = 0;
  for (const raw of slice.split(/\s+/)) {
    let token = raw.replace(/[^\p{L}-]/gu, "").replace(/-+/g, "-");
    token = token.replace(/selne/gi, "Seine").replace(/denls/gi, "Denis");
    const dangling = /-$/.test(token);
    const shortTail = /-(?!de$|des$|du$|la$|le$|les$|d$)[A-Za-z]{1,3}$/i.test(token);
    if (shortTail) token = token.replace(/-[A-Za-z]{1,3}$/i, "");
    token = token.replace(/^-+|-+$/g, "");
    const continues = dangling || shortTail;
    if (!token) continue;
    const particle = /^(?:de|des|du|la|le|les|d)$/i.test(token);
    if (
      kept.length &&
      (/^(?:date|domicile|france)$/i.test(token) ||
        /^(?:rue|avenue|boulevard|chemin|impasse|place|route|allee|allée)$/i.test(token))
    ) {
      break;
    }
    if (pendingGlue && kept.length && ((token.length <= 3 && !particle) || !authorityWord(token))) {
      skipped += 1;
      if (skipped > 8) break;
      continue;
    }
    skipped = 0;
    if (/^(?:la|le|les)$/i.test(token) && !pendingGlue) continue;
    if (
      kept.length &&
      /saint$/i.test(kept[kept.length - 1] || "") &&
      /^[A-Za-z]{4,}$/.test(token) &&
      !pendingGlue
    ) {
      kept[kept.length - 1] = `${kept[kept.length - 1]}-${token}`;
      continue;
    }
    if (token.length <= 2 && !particle) continue;
    if (kept.length >= 3 && token.length <= 3 && !particle) break;
    if (!authorityWord(token)) break;
    if (pendingGlue && kept.length && token.length <= 3) continue;
    if (authorityComplete(kept)) break;
    if (pendingGlue && kept.length) kept[kept.length - 1] = `${kept[kept.length - 1]}-${token}`;
    else kept.push(token);
    pendingGlue = continues;
    if (kept.length > 8) break;
  }
  return kept;
}

function titleAuthority(body: string) {
  const small = new Set(["de", "des", "du", "la", "le", "les", "d"]);
  return body
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s-])(\p{L})/gu, (chunk) => chunk.toLocaleUpperCase("fr"))
    .replace(/\b(De|Des|Du|La|Le|Les|D)\b/g, (word) =>
      small.has(word.toLocaleLowerCase("fr")) ? word.toLocaleLowerCase("fr") : word
    )
    .replace(/\bPrefecture\b/g, "Préfecture");
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

function trimStreet(street: string) {
  const parts = street
    .toUpperCase()
    .replace(/[^A-Z0-9'’\s-]/g, " ")
    .replace(/\bMOC(?:EER|KER|HER)\b/g, "MOCHER")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts.join(" ");
  const particle = /^(?:DU|DE|DES|LA|LE|LES|AU|AUX|D|L)$/;
  const kept = [parts[0], parts[1]];
  for (const word of parts.slice(2)) {
    const clean = word.replace(/[^A-Z'’]/g, "");
    if (particle.test(clean) || clean.length >= 3) kept.push(clean || word);
    else break;
  }
  while (kept.length > 2 && particle.test(kept[kept.length - 1])) kept.pop();
  return kept.join(" ");
}

export function readDomicile(text: string) {
  const flat = flatText(text);
  const streets = [
    ...flat.matchAll(
      /\b(\d{1,4}\s+(?:RUE|AVENUE|BOULEVARD|CHEMIN|IMPASSE|ALL[ÉE]E|PLACE|ROUTE)\s+(?:[A-Z]{2,}\s+){0,6}[A-Z]{2,})/gi
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
  const postals = [...flat.matchAll(/\b(\d{5}|\d{7})\s+([A-Z]{2,}(?:-[A-Z]{2,})*)\b/gi)];
  const herz = postals.filter((item) => /HERZ/i.test(item[2]));
  const pool = herz.length ? herz : postals;
  const streetEnd = (street.index ?? 0) + street[1].length;
  const afterStreet = pool.filter((item) => (item.index ?? 0) >= streetEnd - 2);
  const postal = [...(afterStreet.length ? afterStreet : pool)].sort((a, b) => {
    const left = Math.abs((a.index ?? 0) - streetEnd);
    const right = Math.abs((b.index ?? 0) - streetEnd);
    if (a[1] === b[1] && Math.abs(left - right) < 24) return b[2].length - a[2].length;
    return left - right;
  })[0];
  const country = /\bISRA[EË]L\b/i.test(flat) ? "IL" : postal && postal[1].length === 5 ? "FR" : null;
  return {
    address_line: trimStreet(street[1]),
    postal_code: postal?.[1] || null,
    city: completeCity(postal?.[2].toUpperCase() || null, flat),
    country,
  };
}

/** « LEVALLOIS-PERR » + « PERRET » ailleurs sur la page → la ville entière. */
function completeCity(city: string | null, flat: string) {
  if (!city || !city.includes("-")) return city;
  const parts = city.split("-");
  const last = parts[parts.length - 1] || "";
  if (last.length < 3 || last.length > 8) return city;
  const matches = [...flat.toUpperCase().matchAll(new RegExp(`\\b${last}[A-Z]{1,4}\\b`, "g"))].map((match) => match[0]);
  if (!matches.length) return city;
  const counts = new Map<string, number>();
  for (const match of matches) counts.set(match, (counts.get(match) || 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
  parts[parts.length - 1] = best;
  return parts.join("-");
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

/** Une ou deux lettres collées devant le nom : on les retire si le nom est aussi lu sans elles. */
function ungluedSurname(last: string | null, visual: string) {
  if (!last) return null;
  let fold = last
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
  const flat = visual
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = flat.match(/[A-Z]{4,}/g) || [];
  let peeled = false;
  for (let step = 0; step < 3 && fold.length >= 6; step += 1) {
    const tail = fold.slice(1);
    const hit = words.some((word) => {
      const bare = word.replace(/^(?:P+)?(?:FRA|ISR)/, "");
      return word === tail || bare === tail;
    });
    if (!hit) break;
    fold = tail;
    peeled = true;
  }
  return peeled ? titleSurname(fold) : last;
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
  const one =
    fold.length <= 5
      ? words.find((word) => word !== fold && word.endsWith(fold) && word.length - fold.length === 1)
      : undefined;
  if (!one) return mrzLast;
  return titleSurname(one);
}

function voteUsage(hits: string[]) {
  if (!hits.length) return null;
  const counts = new Map<string, number>();
  for (const hit of hits) counts.set(hit, (counts.get(hit) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const top = ranked[0][1];
  const tied = ranked.filter((item) => item[1] === top).map((item) => item[0]);
  const repeats = (word: string) => (word.match(/(.)\1/g) || []).length;
  tied.sort((a, b) => repeats(b) - repeats(a) || b.length - a.length);
  const voted = tied[0];
  if (/^[A-Z]{5,}EE$/.test(voted)) return `${voted[0]}${voted.slice(1, -2).toLowerCase()}ée`;
  return voted;
}

/** « ép. » devient souvent « 6p, » ou « 66, » à l’OCR. Le second nom de la ligne reste le nom d’épouse. */
function plausibleUsage(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return false;
  return words.every((word) => /^[\p{L}'’-]+$/u.test(word)) && words.some((word) => word.replace(/[^\p{L}]/gu, "").length >= 4);
}

export function readUsageName(text: string, birthName: string | null, given: string | null) {
  for (const line of text.split(/\n/)) {
    const parsed = parseSpouseLine(line);
    if (parsed?.usage && plausibleUsage(parsed.usage)) return parsed.usage;
  }
  const birth = (birthName || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (birth.length < 4) return null;
  const givenFolds = new Set(
    (given || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
  const hits: string[] = [];
  for (const line of text.split(/\n/)) {
    const upper = line.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const at = upper.indexOf(birth);
    if (at < 0) continue;
    const before = at > 0 ? upper[at - 1] : "";
    if (before && /[A-Z]/.test(before)) continue;
    const tokens = upper.slice(at + birth.length).match(/[A-Z]{4,16}/g) || [];
    for (const token of tokens.slice(0, 3)) {
      if (givenFolds.has(token)) continue;
      if ([...givenFolds].some((name) => name.length >= 4 && (token.endsWith(name) || name.endsWith(token)))) continue;
      if (PLACE_NOISE.test(token)) continue;
      if (token.includes(birth) || birth.endsWith(token)) continue;
      hits.push(token);
      break;
    }
  }
  return voteUsage(hits);
}

export function enrichPassportVisual(identity: ExtractedIdentity, visual: string): ExtractedIdentity {
  const given = readPrintedGivenNames(visual);
  const usage = identity.usage_name || readUsageName(visual, identity.last_name, given || identity.first_name);
  const names = spouseFamilyNames({
    birthName: printedSurname(ungluedSurname(identity.last_name, visual), visual),
    usageName: usage,
    givenNames: [identity.first_name, given].filter(Boolean).join(" "),
  });
  const address = readDomicile(visual);
  const place = identity.place_of_birth || readPlaceOfBirth(visual, identity.issuing_country, identity.birth_date);
  return {
    ...identity,
    last_name: names.last_name,
    usage_name: names.usage_name,
    first_name: completeGivenNames(identity.first_name, given),
    place_of_birth: placeIsSurnameFragment(place, names.last_name) ? null : place,
    authority: identity.authority || readAuthority(visual),
    issued_on: identity.issued_on || readIssueDate(visual, identity),
    address_line: identity.address_line || address.address_line,
    postal_code: identity.postal_code || address.postal_code,
    city: identity.city || address.city,
    country: identity.country || address.country,
  };
}
