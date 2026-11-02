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

/**
 * Une page Transavia = un passager. Le bébé indiqué sur la page reste avec l’adulte.
 * Une page reconnue mais incomplète vide la liste : on n’envoie pas un sous-ensemble.
 */
export function readBoardingPassPages(pages: string[]): BoardingPassRead {
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

export async function boardingPassPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await openPdf(bytes);
  const extracted = await extractText(pdf, { mergePages: false });
  const text = extracted.text;
  if (Array.isArray(text)) return text.map((page) => page || "");
  return [typeof text === "string" ? text : ""];
}
