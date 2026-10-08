import { completeGivenNames, type ExtractedIdentity } from "./identity";
import { identityFromMrzLines } from "./mrz-parse";
import { enrichPassportVisual, passportNumberHints, readPrintedGivenNames } from "./passport-visual";

const WEIGHTS = [7, 3, 1];

function charValue(char: string) {
  if (char === "<") return 0;
  const digit = char.charCodeAt(0) - 48;
  if (digit >= 0 && digit <= 9) return digit;
  const letter = char.charCodeAt(0) - 65;
  if (letter >= 0 && letter <= 25) return letter + 10;
  return null;
}

export function icaoCheckDigit(value: string) {
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    const valueOf = charValue(value[i] || "");
    if (valueOf == null) return null;
    sum += valueOf * WEIGHTS[i % 3];
  }
  return String(sum % 10);
}

function fit44(line: string) {
  const cleaned = line.toUpperCase().replace(/[^A-Z0-9<]/g, "");
  return cleaned.length >= 44 ? cleaned.slice(0, 44) : cleaned.padEnd(44, "<");
}

const DIGIT_FIX: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  T: "1",
  Z: "2",
  A: "4",
  S: "5",
  G: "6",
  B: "8",
};

function toDigits(value: string) {
  return value.replace(/[A-Z<]/g, (char) => DIGIT_FIX[char] || char);
}

function mrzLines(text: string) {
  return text
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length >= 18 && (line.includes("<") || /FRA|ISR|1SR/.test(line)));
}

function collapseFillers(line: string) {
  let current = line;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = current
      .replace(/<{1,}[KX]+/g, (chunk) => "<".repeat(chunk.length))
      .replace(/[KX]+<{1,}/g, (chunk) => "<".repeat(chunk.length))
      .replace(/[KX<]+$/g, (chunk) => "<".repeat(chunk.length));
    if (next === current) break;
    current = next;
  }
  return current;
}

function chevronVariant(line: string) {
  if (!line.includes("<<") && !/[A-Z]X[A-Z]/.test(line)) return null;
  const next = line
    .replace(/([A-Z]{4,})C([A-Z]{4,})/g, "$1<$2")
    .replace(/([A-Z]{4,})X([A-Z]{3,})/g, "$1<$2");
  return next === line ? null : next;
}

function cutNameLine(line: string) {
  const head = line.match(/^(P[A-Z<][A-Z]{3}[A-Z]+<<)/);
  if (!head) return null;
  let rest = line.slice(head[1].length);
  const names: string[] = [];
  while (rest) {
    const token = rest.match(/^([A-Z]{2,20})/);
    if (!token) break;
    const word = token[1].replace(/[KX]{2,}.*$/, "");
    if (word.length < 2 || /^[KX]+$/.test(word)) break;
    names.push(word);
    rest = rest.slice(word.length);
    if (!rest.startsWith("<") || rest.startsWith("<<") || /^<[KX]/.test(rest)) break;
    const next = rest.slice(1);
    if (!/^[A-Z]{2,20}/.test(next)) break;
    rest = next;
  }
  if (!names.length) return null;
  return head[1] + names.join("<");
}

function splitGiven(rest: string) {
  const names: string[] = [];
  let cur = rest;
  while (cur && names.length < 4) {
    const token = cur.match(/^([A-Z]{2,16})/);
    if (!token) break;
    let word = token[1];
    const after = cur.slice(word.length);
    if (word.length > 5 && /[CGKX]$/.test(word) && /^[0-9<CGKX]/.test(after)) {
      word = word.replace(/[CGKX]+$/, "");
    }
    if (word.length < 2) break;
    names.push(word);
    if (!after.startsWith("<") || after.startsWith("<<")) break;
    cur = after.slice(1);
  }
  return names;
}

function surnameFromChunk(chunk: string, gluedState: boolean) {
  const stripped = chunk.match(/^(?:P+|[A-Z]{1,2})?(?:FRA|ISR)([A-Z]{4,})$/);
  if (stripped && (gluedState || chunk.length >= 11)) return stripped[1];
  return chunk.replace(/^P+/, "");
}

type NameBody = { surname: string; given: string[] };

function bodiesInLine(line: string): NameBody[] {
  const variant = chevronVariant(line) || line;
  const compact = collapseFillers(variant).toUpperCase().replace(/[^A-Z<]/g, "");
  const gluedState = /P<FRA|P<ISR|PPISR/.test(compact) || /(?:FRA|ISR)[A-Z]{5,}<</.test(compact);
  const found: NameBody[] = [];
  for (const match of compact.matchAll(/([A-Z]{3,})<<([A-Z][A-Z<]{1,})/g)) {
    const surname = surnameFromChunk(match[1], gluedState);
    const given = splitGiven(match[2]);
    if (surname.length >= 3 && given.length) found.push({ surname, given });
  }
  return found;
}

function surnamesCompatible(left: string, right: string) {
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 3 && long.endsWith(short) && long.length - short.length <= 6;
}

const GLARE_LETTER = new Set(["C", "G", "K", "S", "X"]);

function commonSuffix(words: string[]) {
  let stem = words[0] || "";
  for (const word of words.slice(1)) {
    let index = 0;
    while (
      index < stem.length &&
      index < word.length &&
      stem[stem.length - 1 - index] === word[word.length - 1 - index]
    ) {
      index += 1;
    }
    stem = stem.slice(stem.length - index);
  }
  return stem;
}

/** Un « < » lu S, K ou X rallonge un prénom. On ne garde cette lettre que si elle est stable. */
function unglaredStem(options: string[]) {
  const counts = new Map<string, number>();
  for (const item of options) counts.set(item, (counts.get(item) || 0) + 1);
  const unique = [...counts.keys()];
  if (unique.length < 2) return null;
  const suffix = commonSuffix(unique);
  if (suffix.length >= 4) {
    const prefixes = new Set<string>();
    const leading = unique.every((token) => {
      if (token === suffix) return true;
      if (token.length !== suffix.length + 1 || !token.endsWith(suffix)) return false;
      const extra = token[0] || "";
      if (!GLARE_LETTER.has(extra)) return false;
      prefixes.add(extra);
      return true;
    });
    if (leading && (prefixes.size >= 2 || counts.has(suffix))) return suffix;
  }
  for (const short of unique) {
    const longs = unique.filter(
      (token) =>
        token.startsWith(short) &&
        token.length === short.length + 1 &&
        GLARE_LETTER.has(token[token.length - 1] || "")
    );
    if (!longs.length) continue;
    const longCount = longs.reduce((sum, token) => sum + (counts.get(token) || 0), 0);
    if ((counts.get(short) || 0) >= longCount) return short;
  }
  return null;
}

function preferToken(options: string[]) {
  const stem = unglaredStem(options);
  const pool = stem ? options.map(() => stem) : options;
  const counts = new Map<string, number>();
  for (const item of pool) counts.set(item, (counts.get(item) || 0) + 1);
  return pool.reduce((best, item) => {
    const itemExtends = item.startsWith(best) && item.length > best.length;
    const bestExtends = best.startsWith(item) && best.length > item.length;
    if (itemExtends || bestExtends) {
      const short = itemExtends ? best : item;
      const long = itemExtends ? item : best;
      return (counts.get(long) || 0) >= (counts.get(short) || 0) ? long : short;
    }
    if (Math.abs(item.length - best.length) > 2) return best.length < item.length ? best : item;
    return (counts.get(item) || 0) > (counts.get(best) || 0) ? item : best;
  });
}

function attestedNameStems(corpus: string) {
  const upper = corpus.toUpperCase();
  const stems = new Set<string>();
  for (const match of upper.matchAll(/<([A-Z]{3,12})</g)) stems.add(match[1]);
  for (const match of upper.matchAll(/(?:^|[^A-Z])([A-Z]{4,12})<{2,}/g)) {
    stems.add(match[1]);
    const glare = match[1].match(/^[CGKISX]([A-Z]{4,11})$/);
    if (glare) stems.add(glare[1]);
  }
  return stems;
}

/** Un `<` lu S, C, K ou X colle deux prénoms. On les sépare si les deux sont déjà lus. */
function splitGluedGiven(token: string, stems: Set<string>): [string, string] | null {
  if (token.length < 7) return null;
  const heads = [...stems]
    .filter((stem) => stem.length >= 3 && stem.length <= token.length - 5 && token.startsWith(stem))
    .sort((a, b) => b.length - a.length);
  for (const head of heads) {
    let rest = token.slice(head.length);
    if (!/^[CGKSX]/.test(rest)) continue;
    rest = rest.slice(1);
    if (rest.length < 4) continue;
    let best: string | null = null;
    let bestDist = 2;
    for (const stem of stems) {
      if (stem === token || stem.length < 4 || Math.abs(stem.length - rest.length) > 1) continue;
      const dist = editDistance(stem, rest);
      if (dist < bestDist) {
        best = stem;
        bestDist = dist;
      }
    }
    if (best) return [head, best];
  }
  return null;
}

function expandGiven(given: string[], stems: Set<string>) {
  return given.flatMap((token) => splitGluedGiven(token, stems) || [token]);
}

function repairGluedGiven(name: string | null, corpus: string) {
  if (!name) return name;
  const stems = attestedNameStems(corpus);
  let changed = false;
  const out: string[] = [];
  for (const token of name.split(/\s+/)) {
    const fold = token
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z]/g, "");
    const split = splitGluedGiven(fold, stems);
    if (!split) {
      out.push(token);
      continue;
    }
    changed = true;
    for (const part of split) out.push(part[0] + part.slice(1).toLowerCase());
  }
  return changed ? out.join(" ") : name;
}

function chooseSurname(group: NameBody[]) {
  const counts = new Map<string, number>();
  for (const body of group) counts.set(body.surname, (counts.get(body.surname) || 0) + 1);
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (surnamesCompatible(a[0], b[0]) && a[0].length !== b[0].length) return b[0].length - a[0].length;
    return a[0].localeCompare(b[0]);
  })[0][0];
}

function mergeNameBodies(bodies: NameBody[], corpus: string): NameBody[] {
  const stems = attestedNameStems(corpus);
  const prepared = bodies.map((body) => ({ ...body, given: expandGiven(body.given, stems) }));
  const groups: NameBody[][] = [];
  for (const body of prepared) {
    const group = groups.find((members) =>
      members.some(
        (member) =>
          surnamesCompatible(member.surname, body.surname) ||
          member.given.some((token) => body.given.some((other) => token.startsWith(other.slice(0, 4)) || other.startsWith(token.slice(0, 4))))
      )
    );
    if (group) group.push(body);
    else groups.push([body]);
  }
  const merged: NameBody[] = [];
  for (const group of groups) {
    const surname = chooseSurname(group);
    if (surname.length < 4) continue;
    const lengths = group.map((body) => body.given.length);
    const supported = lengths.filter((n) => lengths.filter((c) => c >= n).length * 2 >= group.length);
    const width = Math.max(...supported, 1);
    const given: string[] = [];
    for (let i = 0; i < width; i += 1) {
      const options = group.map((body) => body.given[i]).filter((token): token is string => Boolean(token));
      if (options.length) given.push(preferToken(options));
    }
    if (given.length) merged.push({ surname, given });
  }
  return merged;
}

function lineFromBody(body: NameBody, state: "FRA" | "ISR") {
  const prefix = state === "FRA" ? "P<FRA" : "PPISR";
  return fit44(`${prefix}${body.surname}<<${body.given.join("<")}`);
}

function nameLineCandidates(lines: string[], corpus = "") {
  const out = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const variants = [raw, chevronVariant(raw)].filter((line): line is string => Boolean(line));
    for (const variant of variants) {
      const collapsed = collapseFillers(variant);
      const bodies = [collapsed];
      const cut = cutNameLine(collapsed);
      if (cut) bodies.push(cut);
      for (const body of bodies) {
        if (body.startsWith("P") && body.includes("<<")) out.add(fit44(body));
        const bare = body.match(/^[A-Z]{3,}<<[A-Z]/) ? body : body.replace(/^P[A-Z<][A-Z]{3}/, "");
        if (/^[A-Z]{3,}<<[A-Z]/.test(bare)) {
          const surname = bare.split("<<")[0] || "";
          const clean = surnameFromChunk(surname, surname.length >= 11);
          const rest = bare.slice(surname.length);
          out.add(fit44(`P<FRA${clean}${rest}`));
          out.add(fit44(`PPISR${clean}${rest}`));
        }
      }
    }
  };
  for (const line of lines) push(line);
  for (const body of mergeNameBodies(lines.flatMap((line) => bodiesInLine(line)), corpus)) {
    out.add(lineFromBody(body, "FRA"));
    out.add(lineFromBody(body, "ISR"));
  }
  return [...out];
}

type MrzTail = {
  nat: "FRA" | "ISR";
  birth: string;
  bCheck: string;
  sex: string;
  exp: string;
  eCheck: string;
  personal: string;
  pCheck: string;
  composite: string;
  prefix: string;
};

function parseTailBody(body: string): Omit<MrzTail, "nat" | "prefix"> | null {
  if (body.length < 17) return null;
  const birth = toDigits(body.slice(0, 6));
  const bCheck = toDigits(body[6] || "");
  let sex = body[7] || "";
  if (sex === "N") sex = "M";
  if (!/[MF<]/.test(sex)) return null;
  const exp = toDigits(body.slice(8, 14));
  const eCheck = toDigits(body[14] || "");
  if (!/^\d{6}$/.test(birth) || icaoCheckDigit(birth) !== bCheck) return null;
  if (!/^\d{6}$/.test(exp) || icaoCheckDigit(exp) !== eCheck) return null;
  const rest = body.slice(15);
  if (rest.length < 3) return null;
  const composite = toDigits(rest[rest.length - 1] || "");
  const pCheck = toDigits(rest[rest.length - 2] || "");
  let personal = rest.slice(0, -2).replace(/O/g, "0");
  if (personal.length > 14) personal = personal.slice(0, 14);
  personal = personal.padEnd(14, "<");
  if (!/^\d$/.test(pCheck) || icaoCheckDigit(personal) !== pCheck) return null;
  if (!/^\d$/.test(composite)) return null;
  return { birth, bCheck, sex, exp, eCheck, personal, pCheck, composite };
}

function findTail(fragment: string): MrzTail | null {
  const source = collapseFillers(
    fragment
      .toUpperCase()
      .replace(/[^A-Z0-9<]/g, "")
      .replace(/1SR/g, "ISR")
      .replace(/15R/g, "ISR")
  );
  const match = source.match(/FRA|ISR/);
  if (!match || match.index == null) return null;
  const nat = match[0] as "FRA" | "ISR";
  const after = source.slice(match.index + 3);
  const bodies = [after];
  const head = after.slice(0, 18);
  for (let i = 0; i < Math.min(16, head.length); i += 1) {
    bodies.push(head.slice(0, i) + head.slice(i + 1) + after.slice(head.length));
  }
  for (const body of bodies) {
    const parsed = parseTailBody(body);
    if (!parsed) continue;
    return { nat, ...parsed, prefix: source.slice(0, match.index) };
  }
  return null;
}

function buildLine2(docField: string, tail: MrzTail) {
  if (docField.length !== 9) return null;
  const docCheck = icaoCheckDigit(docField);
  if (!docCheck) return null;
  const line43 =
    docField +
    docCheck +
    tail.nat +
    tail.birth +
    tail.bCheck +
    tail.sex +
    tail.exp +
    tail.eCheck +
    tail.personal +
    tail.pCheck;
  if (line43.length !== 43) return null;
  const compositeSource =
    line43.slice(0, 10) + line43.slice(13, 20) + line43.slice(21, 28) + line43.slice(28, 43);
  const composite = icaoCheckDigit(compositeSource);
  if (composite !== tail.composite) return null;
  return line43 + composite;
}

function editDistance(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 8) return 12;
  const prev = new Array<number>(right.length + 1);
  const curr = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j++) prev[j] = j;
  for (let i = 1; i <= left.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j++) prev[j] = curr[j];
  }
  return prev[right.length];
}

function stitchIsraeliNumbers(suffix: string, hint: string) {
  if (!/^\d{3,8}$/.test(suffix) || !/^\d{4,8}$/.test(hint)) return [];
  if (/^(19|20)\d{2}$/.test(hint)) return [];
  const found: string[] = [];
  for (let overlap = Math.min(hint.length, suffix.length); overlap >= 0; overlap -= 1) {
    if (overlap > 0 && !hint.endsWith(suffix.slice(0, overlap))) continue;
    const head = hint.slice(0, hint.length - overlap);
    const missing = 8 - head.length - suffix.length;
    if (missing < 0 || missing > 2) continue;
    const total = 10 ** missing;
    for (let n = 0; n < total; n += 1) {
      found.push(head + String(n).padStart(missing, "0") + suffix);
    }
  }
  return found;
}

function frenchDocSeeds(prefix: string) {
  const compact = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const seeds: string[] = [];
  for (let i = 0; i + 9 <= compact.length; i += 1) {
    const chunk = compact.slice(i, i + 9);
    if (/^\d{2}[A-Z]{2}\d{5}$/.test(chunk)) seeds.push(chunk);
  }
  return seeds;
}

function hammingNeighbors(seed: string) {
  const out = [seed];
  for (let i = 0; i < seed.length; i += 1) {
    const alphabet = /\d/.test(seed[i] || "") ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const char of alphabet) {
      if (char === seed[i]) continue;
      out.push(seed.slice(0, i) + char + seed.slice(i + 1));
    }
  }
  return out;
}

function docCandidates(tail: MrzTail, hints: string[]) {
  const out = new Set<string>();
  const normalized = hints.map((hint) => hint.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (tail.nat === "ISR") {
    const suffix = tail.prefix.match(/(\d{3,8})<(\d)$/);
    for (const hint of normalized) {
      if (
        /^\d{8}$/.test(hint) &&
        (!suffix || (hint.endsWith(suffix[1].slice(-3)) && icaoCheckDigit(`${hint}<`) === suffix[2]))
      ) {
        out.add(`${hint}<`);
      }
      if (!suffix) continue;
      for (const stitched of stitchIsraeliNumbers(suffix[1], hint)) {
        if (icaoCheckDigit(`${stitched}<`) === suffix[2]) out.add(`${stitched}<`);
      }
    }
  }
  if (tail.nat === "FRA") {
    const seeds = new Set<string>();
    for (const hint of normalized) {
      if (/^\d{2}[A-Z]{2}\d{5}$/.test(hint)) seeds.add(hint);
    }
    for (const seed of frenchDocSeeds(tail.prefix)) seeds.add(seed);
    const limited = [...seeds].slice(0, 4);
    for (const seed of limited) {
      for (const near of hammingNeighbors(seed)) out.add(near);
    }
    if (out.size) return [...out];
    const heads = normalized.filter((hint) => /^\d{2}[A-Z]{2}\d{0,5}$/.test(hint) && hint.length >= 4 && hint.length < 9);
    for (const head of heads) {
      const missing = 9 - head.length;
      if (missing > 4) continue;
      const total = 10 ** missing;
      for (let n = 0; n < total; n += 1) {
        out.add(head + String(n).padStart(missing, "0"));
      }
    }
  }
  return [...out];
}

function recoverLine2(fragment: string, hints: string[]) {
  const tail = findTail(fragment);
  if (!tail) return [];
  const lines: { line: string; distance: number }[] = [];
  for (const doc of docCandidates(tail, hints)) {
    const line = buildLine2(doc, tail);
    if (!line) continue;
    const distance = editDistance(line.slice(Math.max(0, line.length - fragment.length)), fragment.slice(-line.length));
    const boost = hintBoost(line.slice(0, 8), hints);
    lines.push({ line, distance: distance - boost });
  }
  lines.sort((a, b) => a.distance - b.distance);
  const best = lines[0];
  if (!best || best.distance > 8) return [];
  return [best.line];
}

function hintBoost(number: string, hints: string[]) {
  let boost = 0;
  for (const hint of hints) {
    const digits = hint.replace(/\D/g, "");
    if (digits.length < 4 || digits.length >= 8) continue;
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    if (number.includes(digits)) boost = Math.max(boost, digits.length);
  }
  return boost;
}

function directNumberLines(lines: string[]) {
  const out = new Set<string>();
  for (const line of lines) {
    if (line.length >= 40 && line.length <= 48) out.add(fit44(line));
  }
  return [...out];
}

function recoveredNumberLines(lines: string[], hints: string[]) {
  const out = new Set<string>();
  for (const line of lines) {
    for (const recovered of recoverLine2(line, hints)) out.add(recovered);
  }
  return [...out];
}

function issuingCode(line: string) {
  return line.slice(2, 5).replace(/</g, "");
}

function surnameAttested(last: string, corpus: string) {
  const words = corpus.toUpperCase().match(/[A-Z]{3,24}/g) || [];
  return words.some((word) => {
    const bare = word.replace(/^(?:P+)?(?:FRA|ISR)/, "");
    if (word === last || bare === last) return true;
    if (last.length >= 4 && (word.endsWith(last) || bare.endsWith(last)) && word.length - last.length <= 8) {
      return true;
    }
    if (word.length >= 4 && last.endsWith(word) && last.length - word.length === 1) return true;
    return false;
  });
}

function pairScore(identity: ExtractedIdentity, visual: string) {
  const flat = visual.toUpperCase();
  let score = 2;
  const last = (identity.last_name || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (last && flat.includes(last)) score += 6;
  for (const token of (identity.first_name || "").toUpperCase().split(/\s+/)) {
    const fold = token.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (fold && flat.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(fold)) score += 3;
  }
  return score;
}

function pairLines(names: string[], numbers: string[], visualText: string, corpus: string) {
  const found = new Map<string, { identity: ExtractedIdentity; score: number }>();
  for (const nameLine of names) {
    for (const numberLine of numbers) {
      const identity = identityFromMrzLines([nameLine, numberLine]);
      if (!identity?.number) continue;
      const state = issuingCode(nameLine);
      if (identity.nationality && identity.issuing_country && identity.nationality !== identity.issuing_country) {
        continue;
      }
      const nationality = identity.issuing_country === "IL" ? "ISR" : identity.issuing_country === "FR" ? "FRA" : "";
      if (nationality && state && state !== nationality) continue;
      const last = (identity.last_name || "").toUpperCase().replace(/[^A-Z]/g, "");
      if (last.length < 4) continue;
      if (corpus && !surnameAttested(last, corpus)) continue;
      const enriched = enrichPassportVisual(identity, corpus);
      const repaired = repairGluedGiven(enriched.first_name, corpus);
      if (repaired !== enriched.first_name) {
        enriched.first_name = completeGivenNames(repaired, readPrintedGivenNames(corpus)) || repaired;
      }
      const score = pairScore(enriched, corpus) + (enriched.place_of_birth ? 1 : 0);
      const prev = found.get(identity.number);
      const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const nearer = (current: string | null, incoming: string | null) => {
        const left = (current || "").split(/\s+/).filter(Boolean);
        const right = (incoming || "").split(/\s+/).filter(Boolean);
        if (right.length !== left.length) return right.length > left.length;
        for (let index = 0; index < left.length; index += 1) {
          const a = left[index];
          const b = right[index];
          if (fold(a) === fold(b)) {
            if (a === fold(a) && b !== fold(b)) return true;
            continue;
          }
          const glareLonger = (long: string, short: string) => {
            const bare = fold(short);
            const extra = fold(long);
            if (bare.length < 4 || extra.length !== bare.length + 1) return false;
            const letter = extra.startsWith(bare) ? extra[extra.length - 1] : extra.endsWith(bare) ? extra[0] : "";
            return Boolean(letter && GLARE_LETTER.has(letter.toUpperCase()));
          };
          if (glareLonger(b, a)) return false;
          if (glareLonger(a, b)) return true;
          if (fold(b).startsWith(fold(a)) && b.length > a.length) return true;
          if (fold(a).startsWith(fold(b)) && a.length > b.length) return false;
          if (Math.abs(a.length - b.length) === 1) return b.length < a.length;
        }
        return false;
      };
      const richer = !prev || score > prev.score || (score === prev.score && nearer(prev.identity.first_name, enriched.first_name));
      if (richer) found.set(identity.number, { identity: enriched, score });
    }
  }
  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.identity);
}

function sharedTail(left: string, right: string) {
  let same = 0;
  while (same < left.length && same < right.length && left[left.length - 1 - same] === right[right.length - 1 - same]) {
    same += 1;
  }
  return same;
}

/** 43 and 65 can share a check digit. The left edge of the number line breaks the tie. */
function preferCollidingDocNumber(rows: ExtractedIdentity[], corpus: string) {
  const trusted = [...corpus.toUpperCase().matchAll(/(\d{8})<(\d)/g)].filter(
    (match) => icaoCheckDigit(`${match[1]}<`) === match[2]
  );
  if (!trusted.length) return rows;
  return rows.map((row) => {
    const number = row.number;
    if (!number || number.length !== 8) return row;
    const hit = trusted.find(
      (match) =>
        match[1] !== number &&
        icaoCheckDigit(`${number}<`) === match[2] &&
        sharedTail(match[1], number) >= 5
    );
    return hit ? { ...row, number: hit[1] } : row;
  });
}

function calendarDate(value: string) {
  if (!/^\d{6}$/.test(value)) return false;
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function fixDateChars(value: string) {
  return value.replace(/[A-Z<]/g, (char) => DIGIT_FIX[char] || char);
}

/** Naissance + sexe + expiration, même si FRA et les `<` de remplissage ont sauté. */
function dateTails(text: string): Array<Pick<MrzTail, "birth" | "bCheck" | "sex" | "exp" | "eCheck">> {
  const source = text.toUpperCase().replace(/[^A-Z0-9<]/g, "");
  const found = new Map<string, Pick<MrzTail, "birth" | "bCheck" | "sex" | "exp" | "eCheck">>();
  for (let i = 0; i + 15 <= source.length; i += 1) {
    const birth = fixDateChars(source.slice(i, i + 6));
    const bCheck = fixDateChars(source[i + 6] || "");
    let sex = source[i + 7] || "";
    if (sex === "N") sex = "M";
    const exp = fixDateChars(source.slice(i + 8, i + 14));
    const eCheck = fixDateChars(source[i + 14] || "");
    if (!/[MF<]/.test(sex)) continue;
    if (!calendarDate(birth) || icaoCheckDigit(birth) !== bCheck) continue;
    if (!calendarDate(exp) || icaoCheckDigit(exp) !== eCheck) continue;
    found.set(`${birth}${sex}${exp}`, { birth, bCheck, sex, exp, eCheck });
  }
  return [...found.values()];
}

const LETTER_OCR: Record<string, string> = {
  "0": "CODQ",
  "1": "IL",
  "2": "Z",
  "4": "A",
  "5": "S",
  "6": "GC",
  "8": "B",
};

function letterChoices(char: string) {
  if (/[A-Z]/.test(char)) return [char];
  return (LETTER_OCR[char] || "").split("");
}

function pushFrenchDoc(found: Map<string, number>, doc: string, edits: number) {
  const prev = found.get(doc);
  if (prev == null || edits < prev) found.set(doc, edits);
}

/** Une lettre a sauté juste avant FRA. On ne garde l’insertion que si un seul numéro tient. */
function insertFrenchDoc(chunk: string, found: Map<string, number>) {
  if (chunk.length !== 9) return;
  const body = chunk.slice(0, 8);
  const readCheck = chunk[8] || "";
  const accepted: string[] = [];
  for (const slot of [2, 3]) {
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const doc = `${body.slice(0, slot)}${letter}${body.slice(slot)}`;
      if (!/^\d{2}[A-Z]{2}\d{5}$/.test(doc)) continue;
      if (icaoCheckDigit(doc) !== readCheck) continue;
      accepted.push(doc);
    }
  }
  const unique = [...new Set(accepted)];
  if (unique.length === 1) {
    pushFrenchDoc(found, unique[0], 2);
    return;
  }
  const doubled = unique.filter((doc) => doc[2] === doc[3]);
  if (doubled.length === 1) pushFrenchDoc(found, doubled[0], 2);
}

/** Numéro français (2 chiffres, 2 lettres, 5 chiffres), même collé à son contrôle ou à FRA. */
function frenchDocNumbers(text: string) {
  const found = new Map<string, number>();
  const pattern = /(\d{2})([A-Z0-9]{2})(\d{5})(\d)?(?=$|[^A-Z0-9]|FRA|<)/g;
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    const onTitle = /PASSE?PORT/.test(line);
    for (const match of line.matchAll(pattern)) {
      const index = match.index ?? 0;
      const before = index > 0 ? line[index - 1] || "" : "";
      const after = line.slice(index + match[0].length).replace(/^[^A-Z0-9<]+/, "");
      const besideMrz = after.startsWith("FRA") || after.startsWith("<");
      const slots = [letterChoices(match[2][0] || ""), letterChoices(match[2][1] || "")];
      if (slots.some((slot) => !slot.length)) continue;
      const lettersAreClean = /^[A-Z]{2}$/.test(match[2]);
      for (const left of slots[0]) {
        for (const right of slots[1]) {
          const doc = `${match[1]}${left}${right}${match[3]}`;
          if (!/^\d{2}[A-Z]{2}\d{5}$/.test(doc)) continue;
          const check = icaoCheckDigit(doc);
          if (!check) continue;
          const checkMatches = match[4] === check;
          if (match[4] && !checkMatches) continue;
          if (!lettersAreClean && !checkMatches) continue;
          if (checkMatches && !besideMrz && after.length > 0) continue;
          if (!checkMatches && !besideMrz && !onTitle) continue;
          if (before && /[A-Z0-9]/.test(before) && !(checkMatches && besideMrz)) continue;
          pushFrenchDoc(found, doc, lettersAreClean ? 0 : 1);
        }
      }
    }
    if ([...found.values()].some((edits) => edits === 0)) continue;
    for (const match of line.matchAll(/([A-Z0-9]{9})(?=FRA)/g)) insertFrenchDoc(match[1], found);
  }
  const ranked = [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const bestEdit = ranked[0]?.[1] ?? 9;
  return ranked.filter((item) => item[1] === bestEdit).map((item) => item[0]).slice(0, 4);
}

function frenchLine2(
  doc: string,
  tail: Pick<MrzTail, "birth" | "bCheck" | "sex" | "exp" | "eCheck">
) {
  const personal = "<".repeat(14);
  const pCheck = icaoCheckDigit(personal);
  if (!pCheck) return null;
  const line43 =
    doc +
    (icaoCheckDigit(doc) || "") +
    "FRA" +
    tail.birth +
    tail.bCheck +
    tail.sex +
    tail.exp +
    tail.eCheck +
    personal +
    pCheck;
  if (line43.length !== 43) return null;
  const compositeSource =
    line43.slice(0, 10) + line43.slice(13, 20) + line43.slice(21, 28) + line43.slice(28, 43);
  const composite = icaoCheckDigit(compositeSource);
  if (!composite) return null;
  return line43 + composite;
}

function assembledFrenchLines(mrzText: string, corpus: string) {
  const tails = dateTails(mrzText);
  const docs = frenchDocNumbers(corpus);
  const lines = new Set<string>();
  for (const doc of docs) {
    for (const tail of tails) {
      const line = frenchLine2(doc, tail);
      if (line) lines.add(line);
    }
  }
  return [...lines];
}

export function identitiesFromPassportOcr(mrzText: string, visualText: string): ExtractedIdentity[] {
  const corpus = `${mrzText}\n${visualText}`;
  const lines = mrzLines(corpus);
  const hints = passportNumberHints(corpus);
  const names = nameLineCandidates(lines, corpus);
  const direct = pairLines(names, directNumberLines(lines), visualText, corpus);
  const recoveredLines = recoveredNumberLines(lines, hints);
  const recovered = direct.length
    ? direct
    : pairLines(names, recoveredLines, visualText, corpus);
  const rows = recovered.length
    ? recovered
    : pairLines(names, assembledFrenchLines(mrzText, corpus), visualText, corpus);
  return preferCollidingDocNumber(rows, corpus);
}
