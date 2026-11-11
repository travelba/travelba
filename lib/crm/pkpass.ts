import { inflateRawSync } from "node:zlib";
import { foldName, firstNamesMatch, lastNamesMatch } from "./person-match";

/** Passe déjà signé par la compagnie. On ne le re-signe pas. */
export const WALLET_PASS_MIME = "application/vnd.apple.pkpass";

const MAX_PASS_JSON = 256 * 1024;
const EMPTY = /^\s*$/;
const PLACEHOLDER = /^(?:-|—|–|n\/a|na|tbd|tba|null|none|inconnu)$/i;

export type WalletPassExtract = {
  firstName: string | null;
  lastName: string | null;
  /** Libellé passager tel qu’imprimé, si le prénom et le nom ne se séparent pas. */
  passenger: string | null;
  flight: string | null;
  /** Jour AAAA-MM-JJ, seulement s’il est écrit. */
  date: string | null;
  seat: string | null;
  gate: string | null;
  pnr: string | null;
  /** Villes ou codes, seulement si les deux bouts sont écrits. */
  route: string | null;
  travelerId: string | null;
};

export type WalletFlightRef = {
  id: string;
  flightNumber?: string | null;
  /** Jour local du départ, AAAA-MM-JJ. */
  date?: string | null;
  pnr?: string | null;
};

export type WalletTravelerRef = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  usageName?: string | null;
};

type PassField = { key?: string; label?: string; value?: string };

export function isWalletPassName(name: string | null | undefined, mime?: string | null) {
  const type = String(mime || "").split(";")[0].trim().toLowerCase();
  const file = String(name || "").toLowerCase();
  if (file.endsWith(".pkpass")) return true;
  return type === WALLET_PASS_MIME || type.endsWith("/vnd.apple.pkpass");
}

function clean(value: unknown, max: number) {
  if (typeof value === "number" && Number.isFinite(value)) return clean(String(value), max);
  if (typeof value !== "string") return null;
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max || EMPTY.test(text) || PLACEHOLDER.test(text)) return null;
  return text;
}

function compact(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function titleName(value: string) {
  return value
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, sep: string, letter: string) => `${sep}${letter.toLocaleUpperCase("fr-FR")}`);
}

function splitPassenger(value: string | null): { firstName: string | null; lastName: string | null; passenger: string | null } {
  if (!value) return { firstName: null, lastName: null, passenger: null };
  const slash = value.split("/");
  if (slash.length === 2) {
    const lastName = clean(titleName(slash[0] || ""), 80);
    const firstName = clean(titleName(slash[1] || ""), 80);
    if (lastName && firstName) return { firstName, lastName, passenger: value };
  }
  const comma = value.split(",");
  if (comma.length === 2) {
    const lastName = clean(titleName(comma[0] || ""), 80);
    const firstName = clean(titleName(comma[1] || ""), 80);
    if (lastName && firstName) return { firstName, lastName, passenger: value };
  }
  return { firstName: null, lastName: null, passenger: value };
}

function fieldsOf(pass: Record<string, unknown>) {
  const boarding = pass.boardingPass;
  const source = boarding && typeof boarding === "object" ? (boarding as Record<string, unknown>) : pass;
  const lists = ["headerFields", "primaryFields", "secondaryFields", "auxiliaryFields", "additionalInfoFields", "backFields"];
  const out: PassField[] = [];
  for (const key of lists) {
    const list = source[key];
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const field = row as Record<string, unknown>;
      const value = clean(field.value, 160) || clean(field.attributedValue, 160);
      if (!value) continue;
      out.push({
        key: typeof field.key === "string" ? field.key : "",
        label: typeof field.label === "string" ? field.label : "",
        value,
      });
    }
  }
  return out;
}

function keyOf(field: PassField) {
  return `${field.key || ""} ${field.label || ""}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function firstField(fields: PassField[], pattern: RegExp) {
  return fields.find((field) => pattern.test(keyOf(field)))?.value || null;
}

function isoDay(value: string | null) {
  if (!value) return null;
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

function cityEnd(field: PassField | undefined) {
  if (!field?.value) return null;
  const label = clean(field.label, 40);
  if (label && !/^[A-Z]{3}$/.test(label)) return label;
  return field.value;
}

function routeFrom(fields: PassField[]) {
  const origin = fields.find((field) => /origin|depart|from|departure/.test(keyOf(field)) && !/date|time|gate|terminal/.test(keyOf(field)));
  const destination = fields.find((field) => /destination|arrival|arriv|to\b/.test(keyOf(field)) && !/date|time|gate/.test(keyOf(field)));
  const from = cityEnd(origin);
  const to = cityEnd(destination);
  if (!from || !to || from === to) return null;
  return `${from} → ${to}`;
}

/** Lit pass.json. Un champ absent reste null. Le fichier signé n’est pas modifié. */
export function readWalletPass(bytes: Uint8Array): WalletPassExtract | null {
  const json = readZipText(bytes, "pass.json");
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const pass = parsed as Record<string, unknown>;
  const fields = fieldsOf(pass);
  if (!fields.length && !pass.boardingPass && !pass.relevantDate) return null;
  const passenger = splitPassenger(firstField(fields, /passenger|passager|nom du passager/));
  const flight = flightValue(firstField(fields, /flight|numero de vol|\bvol\b/));
  const seat = clean(firstField(fields, /\bseat|siege/), 4);
  const gate = clean(firstField(fields, /\bgate\b|\bporte\b/), 6);
  const pnr = pnrValue(firstField(fields, /\bpnr\b|recordlocator|confirmation|reservation|booking/));
  const dated = firstField(fields, /departuredate|boardingdate|depart|date de depart|\bdate\b/);
  const date = isoDay(dated) || isoDay(typeof pass.relevantDate === "string" ? pass.relevantDate : null);
  return {
    firstName: passenger.firstName,
    lastName: passenger.lastName,
    passenger: passenger.passenger,
    flight,
    date,
    seat,
    gate,
    pnr,
    route: routeFrom(fields),
    travelerId: null,
  };
}

function sameFlight(left: string | null | undefined, right: string | null | undefined) {
  const a = compact(left || "");
  const b = compact(right || "");
  if (a.length < 4 || b.length < 4) return false;
  return a === b;
}

function samePnr(left: string | null | undefined, right: string | null | undefined) {
  const a = compact(left || "");
  const b = compact(right || "");
  return a.length >= 5 && a === b;
}

function flightValue(value: string | null) {
  const text = clean(value, 16);
  if (!text || !/^[A-Z]{1,3}\s?\d{1,4}[A-Z]?$/i.test(text)) return null;
  return text.toUpperCase();
}

function pnrValue(value: string | null) {
  const text = clean(value, 12);
  if (!text || !/^[A-Z0-9]{5,8}$/i.test(text)) return null;
  return text.toUpperCase();
}

function flightDay(flight: WalletFlightRef) {
  const day = String(flight.date || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Rattache le passe au vol et au voyageur seulement s’il n’y a qu’une réponse.
 * Un vol dont le jour contredit le passe est écarté. Rien n’est inventé.
 */
export function matchWalletPass(
  extract: WalletPassExtract,
  flights: WalletFlightRef[],
  travelers: WalletTravelerRef[]
): WalletPassExtract & { itemId: string | null } {
  const byNumber = extract.flight ? flights.filter((flight) => sameFlight(extract.flight, flight.flightNumber)) : [];
  const dated = byNumber.filter((flight) => {
    const day = flightDay(flight);
    if (!extract.date || !day) return true;
    return day === extract.date;
  });
  let chosen: WalletFlightRef | null = null;
  if (dated.length === 1) chosen = dated[0];
  else if (!extract.flight && extract.pnr) {
    const byPnr = flights.filter((flight) => samePnr(extract.pnr, flight.pnr));
    if (byPnr.length === 1) chosen = byPnr[0];
  } else if (extract.pnr && dated.length > 1) {
    const byPnr = dated.filter((flight) => samePnr(extract.pnr, flight.pnr));
    if (byPnr.length === 1) chosen = byPnr[0];
  }
  if (chosen && extract.pnr && chosen.pnr && !samePnr(extract.pnr, chosen.pnr)) chosen = null;

  const named = travelers.filter((person) => travelerHits(extract, person));
  const travelerId = named.length === 1 ? named[0].id : null;
  return { ...extract, travelerId, itemId: chosen?.id || null };
}

/** Un seul .pkpass pour ce passager. Sinon null. */
export function findWalletDocumentId(
  docs: {
    id: string;
    file_name?: string | null;
    mime_type?: string | null;
    extracted?: unknown;
  }[],
  passenger: { firstName?: string | null; lastName?: string | null; flight?: string | null }
) {
  const hits = docs.filter((doc) => {
    if (!isWalletPassName(doc.file_name, doc.mime_type)) return false;
    const extract = storedWalletPass(doc.extracted);
    if (extract?.flight && passenger.flight && !sameFlight(extract.flight, passenger.flight)) return false;
    if (extract?.firstName && passenger.firstName && !firstNamesMatch(extract.firstName, passenger.firstName)) return false;
    if (extract?.lastName && passenger.lastName && !lastNamesMatch(extract.lastName, passenger.lastName)) return false;
    if (extract?.firstName || extract?.flight) return true;
    const file = foldName(doc.file_name);
    const flight = compact(passenger.flight || "");
    const last = foldName(passenger.lastName);
    if (flight && !compact(doc.file_name || "").includes(flight)) return false;
    if (last && !file.includes(last)) return false;
    return Boolean(flight || last);
  });
  return hits.length === 1 ? hits[0].id : null;
}

/** Vol demandé par l’agence, seulement s’il ne contredit pas le passe. */
export function chooseWalletItem(
  extract: WalletPassExtract | null,
  matchedItemId: string | null,
  requested: WalletFlightRef | null
) {
  if (matchedItemId) return matchedItemId;
  if (!requested) return null;
  if (!extract?.flight) return requested.id;
  if (!sameFlight(extract.flight, requested.flightNumber)) return null;
  const day = flightDay(requested);
  if (extract.date && day && extract.date !== day) return null;
  return requested.id;
}

function travelerHits(extract: WalletPassExtract, person: WalletTravelerRef) {
  const first = person.firstName || "";
  const last = person.lastName || "";
  const usage = person.usageName || "";
  if (extract.firstName && extract.lastName) {
    const firstOk = firstNamesMatch(extract.firstName, first);
    const lastOk = lastNamesMatch(extract.lastName, last) || (usage ? lastNamesMatch(extract.lastName, usage) : false);
    return firstOk && lastOk;
  }
  const raw = foldName(extract.passenger);
  if (!raw) return false;
  const lastFold = foldName(last);
  const usageFold = foldName(usage);
  const firstFold = foldName(first);
  if (!firstFold || (!lastFold && !usageFold)) return false;
  const lastOk = (lastFold && raw.includes(lastFold)) || (usageFold && raw.includes(usageFold));
  return Boolean(lastOk && raw.includes(firstFold));
}

function readZipText(bytes: Uint8Array, wanted: string) {
  if (bytes.byteLength < 22 || bytes.byteLength > 8 * 1024 * 1024) return null;
  const eocd = findEocd(bytes);
  if (eocd < 0) return null;
  const count = readU16(bytes, eocd + 8);
  let cursor = readU32(bytes, eocd + 16);
  if (count < 1 || count > 64 || cursor < 0 || cursor >= bytes.length) return null;
  for (let index = 0; index < count; index += 1) {
    if (readU32(bytes, cursor) !== 0x02014b50) return null;
    const method = readU16(bytes, cursor + 10);
    const flags = readU16(bytes, cursor + 8);
    const compressed = readU32(bytes, cursor + 20);
    const uncompressed = readU32(bytes, cursor + 24);
    const nameLen = readU16(bytes, cursor + 28);
    const extraLen = readU16(bytes, cursor + 30);
    const commentLen = readU16(bytes, cursor + 32);
    const local = readU32(bytes, cursor + 42);
    const name = readName(bytes, cursor + 46, nameLen);
    const next = cursor + 46 + nameLen + extraLen + commentLen;
    if (next > bytes.length) return null;
    if (name === wanted) {
      if (flags & 0x1) return null;
      if (uncompressed > MAX_PASS_JSON || compressed > MAX_PASS_JSON) return null;
      return inflateEntry(bytes, local, method, compressed);
    }
    cursor = next;
  }
  return null;
}

function inflateEntry(bytes: Uint8Array, local: number, method: number, compressed: number) {
  if (readU32(bytes, local) !== 0x04034b50) return null;
  const nameLen = readU16(bytes, local + 26);
  const extraLen = readU16(bytes, local + 28);
  const start = local + 30 + nameLen + extraLen;
  const end = start + compressed;
  if (start < 0 || end > bytes.length) return null;
  const slice = bytes.subarray(start, end);
  try {
    if (method === 0) return new TextDecoder("utf-8", { fatal: false }).decode(slice);
    if (method === 8) return new TextDecoder("utf-8", { fatal: false }).decode(inflateRawSync(slice));
  } catch {
    return null;
  }
  return null;
}

function findEocd(bytes: Uint8Array) {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      return index;
    }
  }
  return -1;
}

function readU16(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readName(bytes: Uint8Array, offset: number, length: number) {
  if (length < 0 || offset < 0 || offset + length > bytes.length) return "";
  return new TextDecoder("utf-8").decode(bytes.subarray(offset, offset + length));
}

/** Extrait déjà enregistré. Un champ illisible est ignoré, pas complété. */
export function storedWalletPass(value: unknown): WalletPassExtract | null {
  const source = typeof value === "string" ? parseJson(value) : value;
  if (!source || typeof source !== "object") return null;
  const row = source as Record<string, unknown>;
  const extract: WalletPassExtract = {
    firstName: clean(row.firstName, 80),
    lastName: clean(row.lastName, 80),
    passenger: clean(row.passenger, 120),
    flight: clean(row.flight, 40),
    date: isoDay(clean(row.date, 40)),
    seat: clean(row.seat, 12),
    gate: clean(row.gate, 20),
    pnr: clean(row.pnr, 20),
    route: clean(row.route, 80),
    travelerId: /^[0-9a-f-]{36}$/i.test(String(row.travelerId || "")) ? String(row.travelerId) : null,
  };
  if (!extract.firstName && !extract.lastName && !extract.passenger && !extract.flight && !extract.seat && !extract.gate && !extract.pnr) {
    return null;
  }
  return extract;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
