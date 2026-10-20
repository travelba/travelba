import { addIsoDays } from "./dates";

const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const WEEKDAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Noms d’aéroports que le modèle connaît même si le dossier n’a que le code. */
const AIRPORT_NAMES: Record<string, string> = {
  CDG: "Charles de Gaulle",
  ORY: "Orly",
  LBG: "Le Bourget",
  LYS: "Saint-Exupéry",
  MRS: "Marignane",
  NCE: "Côte d'Azur",
  TLS: "Blagnac",
  BOD: "Mérignac",
  GVA: "Genève",
  RAK: "Ménara",
  AMS: "Schiphol",
  FRA: "Francfort",
  LHR: "Heathrow",
  JFK: "Kennedy",
};

export type ParisMoment = {
  date: string;
  time: string;
  weekday: string;
  label: string;
};

export type RelativeWhen = { kind: "date"; date: string } | { kind: "last-trip" } | { kind: "return" };

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function part(now: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", ...options })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, row) => {
      if (row.type !== "literal") acc[row.type] = row.value;
      return acc;
    }, {});
}

/** Date et heure civiles à Paris. Le jour ne dépend pas du fuseau du serveur. */
export function parisMoment(now: Date): ParisMoment {
  const day = part(now, { year: "numeric", month: "2-digit", day: "2-digit" });
  const clock = part(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const date = `${day.year}-${day.month}-${day.day}`;
  const weekday = frenchWeekday(date);
  const time = `${clock.hour}:${clock.minute}`;
  return { date, time, weekday, label: `${weekday} ${frenchLongDate(date)}, ${time}` };
}

export function englishWeekday(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const name = WEEKDAYS_EN[utc.getUTCDay()] || "";
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "";
}

export function frenchWeekday(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const index = utc.getUTCDay();
  return WEEKDAYS_FR[index] || "";
}

export function frenchLongDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const monthName = MONTHS_FR[month - 1] || "";
  return `${day} ${monthName} ${year}`;
}

export function englishLongDate(isoDate: string) {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * « jeudi » = le jeudi qui vient, aujourd’hui compris.
 * « jeudi prochain » un jeudi = le jeudi d’après.
 * « demain », « mon dernier voyage », « le retour ».
 */
export function relativeWhen(message: string, now: Date): RelativeWhen | null {
  const text = fold(message);
  if (/dernier (voyage|sejour|vol)|last (trip|stay)|הטיול האחרון/.test(text)) return { kind: "last-trip" };
  if (/\b(le retour|vol de retour|au retour|date de retour|return flight|the return)\b/.test(text)) return { kind: "return" };
  const today = parisMoment(now).date;
  if (/\b(apres-demain|apres demain|day after tomorrow)\b/.test(text)) return { kind: "date", date: addIsoDays(today, 2) };
  if (/\b(demain|tomorrow)\b/.test(text)) return { kind: "date", date: addIsoDays(today, 1) };
  if (/\b(hier|yesterday)\b/.test(text)) return { kind: "date", date: addIsoDays(today, -1) };
  const fr = WEEKDAYS_FR.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  const en = WEEKDAYS_EN.findIndex((name) => new RegExp(`\\b${name}\\b`).test(text));
  const target = fr >= 0 ? fr : en;
  if (target < 0) return null;
  const todayIndex = WEEKDAYS_FR.indexOf(frenchWeekday(today) as (typeof WEEKDAYS_FR)[number]);
  let delta = (target - todayIndex + 7) % 7;
  if (delta === 0 && /\b(prochain|next)\b/.test(text)) delta = 7;
  return { kind: "date", date: addIsoDays(today, delta) };
}

export function airportSpokenName(code: string) {
  return AIRPORT_NAMES[code.trim().toUpperCase()] || "";
}

export function segmentDate(startAt: string | null | undefined) {
  const raw = (startAt || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}
