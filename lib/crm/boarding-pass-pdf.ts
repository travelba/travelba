import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { formatDateFr } from "./dates";
import { greetingGivenName } from "./identity";
import { openPdf } from "./pdf-raster";
import {
  boardingPassDedupeKey,
  boardingPassFields,
  cleanTemplateValue,
  type BoardingPassFields,
} from "./boarding-pass-whatsapp";

/** Lecture incomplète : aucun siège, horaire ou nom n’est complété. */
export const BOARDING_PASS_MISSING =
  "Le prénom, le nom, le vol, le trajet, l’horaire ou le siège manque sur la carte. Rien n’est inventé.";

export type BoardingPassPassenger = BoardingPassFields & { page: number };

export type BoardingPassRead = {
  recognized: boolean;
  passengers: BoardingPassPassenger[];
};

const LABEL =
  /carte d[’']embarquement/i;
const FLIGHT_LABEL = /flight number\/num[eé]ro de vol|num[eé]ro de vol/i;
const SEAT_LABEL = /seat\/si[eè]ge|si[eè]ge/i;

function linesOf(page: string) {
  return page
    .replace(/\u00a0/g, " ")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeBoardingPass(page: string) {
  return LABEL.test(page) && FLIGHT_LABEL.test(page) && SEAT_LABEL.test(page);
}

function isUpperName(word: string) {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return false;
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function splitPassengerName(line: string) {
  if (/^(date|flight|seat|gate|terminal|boarding|référence|reference|avec)\b/i.test(line)) return null;
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.every(isUpperName)) {
    const last = parts.pop() || "";
    return { first: parts.join(" "), last };
  }
  const lastParts: string[] = [];
  while (parts.length > 1 && isUpperName(parts[parts.length - 1] || "")) {
    lastParts.unshift(parts.pop() || "");
  }
  if (!lastParts.length || !parts.length) return null;
  return { first: parts.join(" "), last: lastParts.join(" ") };
}

function nameFromPage(lines: string[]) {
  const at = lines.findIndex((line) => /^seq\.?\s*nr\.?/i.test(line));
  if (at < 0) return null;
  const line = lines[at + 1] || "";
  if (!line || /^avec bébé/i.test(line) || /^r[ée]f[ée]rence/i.test(line)) return null;
  return splitPassengerName(line);
}

/** L’étiquette est en début de ligne. « sous le siège » ou « avant l’heure de départ » ne comptent pas. */
function valueAfter(lines: string[], pattern: RegExp) {
  const at = lines.findIndex((line) => pattern.test(line));
  if (at < 0) return "";
  const line = lines[at] || "";
  const rest = line.replace(pattern, "").replace(/^[\s:/-]+/, "").trim();
  return rest || lines[at + 1] || "";
}

function titlePlace(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (/[\p{L}]/u.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

function routeFromPage(page: string) {
  const match = page.match(
    /([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s*\(([^)]+)\)\s*\(([A-Z]{3})\)\s+([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s*\(([A-Z]{3})\)/
  );
  if (!match) return "";
  const fromCity = titlePlace(match[1] || "");
  const fromPlace = titlePlace((match[2] || "").trim());
  const toCity = titlePlace(match[4] || "");
  const from = fromPlace && fromPlace.toLowerCase() !== fromCity.toLowerCase() ? `${fromCity} (${fromPlace})` : fromCity;
  return from && toCity ? `${from} → ${toCity}` : "";
}

function whenFromPage(lines: string[]) {
  const date = valueAfter(lines, /^date\/date$/i);
  const clock = valueAfter(lines, /^heure de d[ée]part\b/i);
  const day = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const time = clock.match(/^(\d{2}):(\d{2})$/);
  if (!day || !time) return "";
  const iso = `${day[3]}-${day[2]}-${day[1]}`;
  const label = formatDateFr(iso);
  if (!label || label === "—") return "";
  return `${label} à ${time[1]}h${time[2]}`;
}

function flightFromPage(lines: string[]) {
  const raw = valueAfter(lines, /^(?:flight number\/)?num[eé]ro de vol\b/i).replace(/\s+/g, " ").trim();
  const match = raw.match(/^([A-Z]{1,3})\s*(\d{2,4})$/i);
  if (!match) return "";
  return `${(match[1] || "").toUpperCase()} ${match[2]}`;
}

function seatFromPage(lines: string[]) {
  const raw = valueAfter(lines, /^seat\/si[eè]ge\b/i);
  const match = raw.match(/^(\d{1,2}[A-Z])\b/i);
  return match ? (match[1] || "").toUpperCase() : "";
}

function pagePassenger(page: string, pageNumber: number): BoardingPassPassenger | null {
  const lines = linesOf(page);
  const name = nameFromPage(lines);
  const firstName = greetingGivenName(name?.first);
  const fields = boardingPassFields({
    firstName: firstName || "",
    lastName: name?.last || "",
    flight: flightFromPage(lines),
    route: routeFromPage(page),
    when: whenFromPage(lines),
    seat: seatFromPage(lines),
  });
  if (!fields) return null;
  return { ...fields, page: pageNumber };
}

const AF_MONTHS: Record<string, number> = {
  jan: 1,
  janv: 1,
  january: 1,
  janvier: 1,
  feb: 2,
  fev: 2,
  fevr: 2,
  february: 2,
  fevrier: 2,
  mar: 3,
  mars: 3,
  march: 3,
  apr: 4,
  avr: 4,
  avril: 4,
  april: 4,
  may: 5,
  mai: 5,
  jun: 6,
  juin: 6,
  june: 6,
  jul: 7,
  juil: 7,
  july: 7,
  juillet: 7,
  aug: 8,
  aou: 8,
  aout: 8,
  august: 8,
  sep: 9,
  sept: 9,
  septembre: 9,
  september: 9,
  oct: 10,
  octobre: 10,
  october: 10,
  nov: 11,
  novembre: 11,
  november: 11,
  dec: 12,
  decembre: 12,
  december: 12,
};

const AF_SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function exactNext(lines: string[], pattern: RegExp) {
  const at = lines.findIndex((line) => pattern.test(line));
  if (at < 0) return "";
  return lines[at + 1] || "";
}

function airFranceName(lines: string[]) {
  for (const line of lines) {
    if (/\d/.test(line)) continue;
    const match = line.match(/^([\p{Lu}][\p{Lu}'’ .-]{1,40}?)\s*,\s*([\p{L}][\p{L}'’ .-]{1,60})$/u);
    if (!match) continue;
    const last = (match[1] || "").replace(/\s+/g, " ").trim();
    const first = greetingGivenName(match[2]);
    if (!last || !first) continue;
    return { first, last };
  }
  return null;
}

function airFranceFlight(lines: string[]) {
  const raw = exactNext(lines, /^vol$/i).replace(/\s+/g, "");
  const match = raw.match(/^([A-Z]{1,3})(\d{2,4})$/i);
  if (!match) return "";
  return `${(match[1] || "").toUpperCase()} ${match[2]}`;
}

function airFranceSeat(lines: string[]) {
  const match = exactNext(lines, /^si[eè]ge$/i).match(/^(\d{1,2}[A-Z])\b/i);
  return match ? (match[1] || "").toUpperCase() : "";
}

function airFranceRoute(lines: string[]) {
  const cities: string[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^[A-Z]{3}$/.test(lines[index] || "")) continue;
    const city = lines[index + 1] || "";
    if (!/^[\p{L}][\p{L} .'-]{1,40}$/u.test(city)) continue;
    cities.push(titlePlace(city));
    if (cities.length === 2) break;
  }
  if (cities.length < 2) return "";
  return `${cities[0]} → ${cities[1]}`;
}

function monthNumber(token: string) {
  const key = token
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "");
  return AF_MONTHS[key] || 0;
}

/** « 13:50 / 11 Nov » ou avec l’année. Sans année sur la page, on ne l’invente pas. */
function airFranceWhen(lines: string[]) {
  const stamp = lines.find((line) => /^\d{2}:\d{2}\s*\/\s*\d{1,2}\s+/u.test(line));
  if (!stamp) return "";
  const match = stamp.match(/^(\d{2}):(\d{2})\s*\/\s*(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)(?:\s+(\d{4}))?/u);
  if (!match) return "";
  const month = monthNumber(match[4] || "");
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return "";
  const clock = `${match[1]}h${match[2]}`;
  const year = match[5];
  if (year) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const label = formatDateFr(iso);
    if (!label || label === "—") return "";
    return `${label} à ${clock}`;
  }
  return `${day} ${AF_SHORT_MONTHS[month - 1]} à ${clock}`;
}

function airFrancePassenger(page: string, pageNumber: number): BoardingPassPassenger | null {
  if (!/air france/i.test(page) && !/carte d[’']embarquement/i.test(page)) return null;
  const lines = linesOf(page);
  const name = airFranceName(lines);
  const fields = boardingPassFields({
    firstName: name?.first || "",
    lastName: name?.last || "",
    flight: airFranceFlight(lines),
    route: airFranceRoute(lines),
    when: airFranceWhen(lines),
    seat: airFranceSeat(lines),
  });
  if (!fields) return null;
  return { ...fields, page: pageNumber };
}

function readAirFranceBoardingPasses(pages: string[]): BoardingPassRead {
  const passengers: BoardingPassPassenger[] = [];
  let recognized = false;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] || "";
    const lines = linesOf(page);
    if (!airFranceFlight(lines) || !airFranceSeat(lines) || !airFranceName(lines)) continue;
    recognized = true;
    const passenger = airFrancePassenger(page, index + 1);
    if (!passenger) return { recognized: true, passengers: [] };
    passengers.push(passenger);
  }
  return { recognized, passengers };
}

/**
 * Une page Transavia = un passager. Le bébé indiqué sur la page reste avec l’adulte.
 * Une page Air France (« NOM , Prénom », vol, siège) suit la même règle : une page, un passager.
 * Une page reconnue mais incomplète vide la liste : on n’envoie pas un sous-ensemble.
 */
export function readBoardingPassPages(pages: string[]): BoardingPassRead {
  if (pages.some((page) => looksLikeBoardingPass(page))) {
    const passengers: BoardingPassPassenger[] = [];
    let recognized = false;
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index] || "";
      if (!looksLikeBoardingPass(page)) continue;
      recognized = true;
      const passenger = pagePassenger(page, index + 1);
      if (!passenger) return { recognized: true, passengers: [] };
      passengers.push(passenger);
    }
    return { recognized, passengers };
  }
  return readAirFranceBoardingPasses(pages);
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function passengerFromOverride(row: Record<string, unknown>, page: number): BoardingPassPassenger | null {
  const firstName = cleanTemplateValue(greetingGivenName(textOf(row.prenom)) || textOf(row.prenom), 40);
  const rawLast = textOf(row.nom);
  const lastName = rawLast ? cleanTemplateValue(rawLast, 40) : "";
  const flight = cleanTemplateValue(textOf(row.vol), 40);
  const route = cleanTemplateValue(textOf(row.trajet), 80);
  const when = cleanTemplateValue(textOf(row.date_heure), 60);
  const seat = cleanTemplateValue(textOf(row.siege), 12);
  if (!firstName || !flight || !route || !when || !seat || (rawLast && !lastName)) return null;
  return { firstName, lastName: lastName || "", flight, route, when, seat, page };
}

/** Champs saisis, seulement si la lecture du PDF n’a pas suffi. Un champ vide n’est pas deviné. */
export function overrideBoardingPassengers(input: Record<string, unknown>): {
  provided: boolean;
  passengers: BoardingPassPassenger[];
} {
  if (Array.isArray(input.passagers)) {
    const passengers: BoardingPassPassenger[] = [];
    for (let index = 0; index < input.passagers.length; index += 1) {
      const row = input.passagers[index];
      if (!row || typeof row !== "object") return { provided: true, passengers: [] };
      const passenger = passengerFromOverride(row as Record<string, unknown>, index + 1);
      if (!passenger) return { provided: true, passengers: [] };
      passengers.push(passenger);
    }
    return { provided: true, passengers };
  }
  const keys = ["prenom", "nom", "vol", "trajet", "date_heure", "siege"] as const;
  const provided = keys.some((key) => textOf(input[key]));
  if (!provided) return { provided: false, passengers: [] };
  const passenger = passengerFromOverride(input, 1);
  return { provided: true, passengers: passenger ? [passenger] : [] };
}

export function boardingPassSendKey(documentId: string, page: number, count: number) {
  if (count <= 1) return boardingPassDedupeKey(documentId);
  return `${boardingPassDedupeKey(documentId)}:${page}`;
}

export function storedBoardingPassName(fileName: string | null | undefined) {
  const name = String(fileName || "").replace(/[\r\n"\\]/g, "").trim();
  if (!name.toLowerCase().endsWith(".pdf") || name.length > 120 || name.includes("/") || name.includes("..")) return null;
  return name;
}

/**
 * Ne garde que les pages demandées (1 = première page). Le PDF d’archive n’est pas modifié.
 * Une page absente ou un fichier illisible renvoie null : on ne sert pas le document entier à la place.
 */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return source.getPageCount();
  } catch {
    return null;
  }
}

export async function slicePdfPages(bytes: Uint8Array, pages: number[]): Promise<Uint8Array | null> {
  if (!pages.length) return null;
  try {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = source.getPageCount();
    const indexes = pages.map((page) => page - 1);
    if (indexes.some((index) => index < 0 || index >= total)) return null;
    const next = await PDFDocument.create();
    const copied = await next.copyPages(source, indexes);
    for (const page of copied) next.addPage(page);
    return new Uint8Array(await next.save());
  } catch {
    return null;
  }
}

export async function boardingPassPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openPdf(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const text = extracted.text;
  if (Array.isArray(text)) return text.map((page) => page || "");
  return [typeof text === "string" ? text : ""];
}
