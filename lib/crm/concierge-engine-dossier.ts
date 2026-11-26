import { countriesForSelect, resolveCountryCode } from "@/lib/crm/countries";
import { ONLINE_CHECKIN_LABELS, type OnlineCheckinStatus } from "@/lib/crm/online-checkin";
import {
  destinationCountryName,
  entryForFrenchPassport,
  frenchEntryNeedsFormality,
  officialVisaApplyUrl,
  VISA_RULES_AS_OF,
} from "@/lib/crm/visa-fr";
import type { ConciergeHistoryTurn } from "@/lib/crm/whatsapp-conversation";
import type { ConciergeDossier, ConciergeItem, ConciergeStay } from "@/lib/crm/whatsapp-concierge";

export type EnginePhase = "en_cours" | "a_venir" | "passe";

export type EngineFlight = {
  sens: "aller" | "retour" | "autre";
  numero: string;
  de: string;
  vers: string;
  deCode: string;
  versCode: string;
  date: string | null;
  heureLocale: string;
  heureParis: string;
  arriveeLocale: string;
  terminal: string;
  enregistrement: string;
  cartes: boolean;
};

export type EngineStayView = {
  id: string;
  reference: string;
  phase: EnginePhase;
  titre: string;
  destination: string;
  debut: string | null;
  fin: string | null;
  hotel: string | null;
  passagers: string[];
  alias: string | null;
  vols: EngineFlight[];
};

export type EngineTraveler = {
  bookingId: string;
  firstName: string | null;
  lastName: string | null;
};

export type EngineCheckin = {
  flightNumber: string;
  status: string;
};

const SCHENGEN = new Set([
  "CDG", "ORY", "NCE", "LYS", "MRS", "TLS", "BOD", "NTE", "FCO", "MXP", "LIN", "BCN", "MAD", "AGP",
  "AMS", "BRU", "LIS", "OPO", "VIE", "ZRH", "GVA", "MUC", "FRA", "BER", "CPH", "ARN", "OSL", "HEL",
  "ATH", "PRG", "BUD", "WAW", "VCE", "NAP", "BLQ",
]);

const ALIAS_GROUPS = [
  ["cancun", "cancún", "riviera maya", "mayakoba", "playa del carmen", "tulum", "mexique"],
  ["rome", "roma", "italie"],
  ["paris"],
  ["nice", "côte d'azur", "cote d'azur"],
];

export function foldEngine(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function parisDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

function phaseOf(stay: ConciergeStay, now: Date): EnginePhase {
  const today = parisDay(now);
  if (stay.startDate && stay.endDate && stay.startDate <= today && today <= stay.endDate) return "en_cours";
  if (stay.startDate && stay.startDate > today) return "a_venir";
  return "passe";
}

const PHASE_RANK: Record<EnginePhase, number> = { en_cours: 0, a_venir: 1, passe: 2 };

/** Heure murale d’un fuseau, exprimée à Paris. */
export function clockInParis(date: string | null, clock: string, timeZone: string) {
  const match = /^(\d{2})h(\d{2})$/.exec(clock || "");
  if (!date || !match) return clock || "";
  const zone = timeZone || "Europe/Paris";
  const [year, month, day] = date.split("-").map(Number);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!year || !month || !day) return clock;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcGuess);
  const part = (type: string) => Number(formatted.find((row) => row.type === type)?.value || "0");
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"));
  const instant = new Date(utcGuess.getTime() - (asUtc - utcGuess.getTime()));
  const paris = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const h = paris.find((row) => row.type === "hour")?.value || "00";
  const m = paris.find((row) => row.type === "minute")?.value || "00";
  return `${h === "24" ? "00" : h}h${m}`;
}

function hotelName(item: ConciergeItem) {
  const line = item.lines[0] || "";
  const name = line.split(",")[0]?.trim() || "";
  return name || null;
}

function passengerNames(stayId: string, travelers: EngineTraveler[]) {
  const names = travelers
    .filter((row) => row.bookingId === stayId)
    .map((row) => [row.firstName, row.lastName].filter(Boolean).join(" ").trim())
    .filter((name) => name && !/\d{6,}/.test(name));
  return [...new Set(names)];
}

function checkinLabel(status: string) {
  if (status in ONLINE_CHECKIN_LABELS) return ONLINE_CHECKIN_LABELS[status as OnlineCheckinStatus];
  return "Non renseigné";
}

function boarding(stay: ConciergeStay) {
  return stay.documents.some((label) => /embarquement|boarding/i.test(label));
}

function flightsOf(stay: ConciergeStay, checkins: EngineCheckin[], cards: boolean): EngineFlight[] {
  const rows = stay.items.filter((item) => item.kind === "flight" || item.flightNumber);
  const mapped: EngineFlight[] = rows.map((item) => {
    const status = checkins.find((row) => row.flightNumber && row.flightNumber === item.flightNumber)?.status || "";
    return {
      sens: "autre",
      numero: item.flightNumber,
      de: item.fromPlace,
      vers: item.toPlace,
      deCode: item.fromCode,
      versCode: item.toCode,
      date: item.date,
      heureLocale: item.clock,
      heureParis: clockInParis(item.date, item.clock, item.timezone),
      arriveeLocale: item.arrival,
      terminal: item.terminal,
      enregistrement: checkinLabel(status),
      cartes: cards,
    };
  });
  if (mapped.length >= 2) {
    mapped[0].sens = "aller";
    mapped[mapped.length - 1].sens = "retour";
  } else if (mapped.length === 1) {
    mapped[0].sens = "aller";
  }
  return mapped;
}

function aliasFor(message: string, stay: ConciergeStay) {
  const asked = foldEngine(message);
  const place = foldEngine(`${stay.destination || ""} ${stay.title}`);
  for (const group of ALIAS_GROUPS) {
    const folded = group.map((token) => foldEngine(token));
    const askedHit = folded.find((token) => asked.includes(token));
    const stayHit = folded.find((token) => place.includes(token));
    if (!askedHit || !stayHit || askedHit === stayHit) continue;
    const label = group.find((token) => foldEngine(token) === askedHit) || askedHit;
    return `${label} désigne le séjour ${stay.destination || stay.title}`;
  }
  return null;
}

export function orderStays(stays: ConciergeStay[], now: Date) {
  return [...stays].sort((a, b) => {
    const rank = PHASE_RANK[phaseOf(a, now)] - PHASE_RANK[phaseOf(b, now)];
    if (rank) return rank;
    if (phaseOf(a, now) === "passe") return (b.endDate || "").localeCompare(a.endDate || "");
    return (a.startDate || "").localeCompare(b.startDate || "");
  });
}

/** Dossier lisible par le modèle. Pas de passeport, pas de naissance, pas de MRZ. */
export function normalizeDossier(input: {
  dossier: ConciergeDossier;
  message: string;
  now: Date;
  travelers?: EngineTraveler[];
  checkins?: EngineCheckin[];
}) {
  const travelers = input.travelers || [];
  const checkins = input.checkins || [];
  const stays = orderStays(input.dossier.stays, input.now).map((stay) => {
    const cards = boarding(stay);
    const hotel = stay.items.find((item) => item.kind === "hotel");
    return {
      id: stay.id,
      reference: stay.reference,
      phase: phaseOf(stay, input.now),
      titre: stay.title,
      destination: stay.destination || stay.title,
      debut: stay.startDate,
      fin: stay.endDate,
      hotel: hotel ? hotelName(hotel) : null,
      passagers: passengerNames(stay.id, travelers),
      alias: aliasFor(input.message, stay),
      vols: flightsOf(stay, checkins, cards),
    } satisfies EngineStayView;
  });
  const balance = input.dossier.balances[0] || null;
  return {
    prenom: input.dossier.firstName,
    sejours: stays,
    solde: balance ? { devise: balance.currency, montant: balance.balance } : null,
  };
}

/** Au-delà des derniers tours, on garde l’ouverture et les questions plus anciennes, raccourcies. */
export function truncateHistory(turns: ConciergeHistoryTurn[], full = 24) {
  if (turns.length <= full) return turns;
  const tail = turns.slice(-full);
  const head = turns.slice(0, -full);
  const inbound = head.filter((row) => row.direction === "inbound" && row.body.trim());
  const opener = inbound.slice(0, 2);
  const recent = inbound.slice(-8);
  const picked = [...opener];
  for (const row of recent) {
    if (!picked.includes(row)) picked.push(row);
  }
  const digest = picked.map((row) => ({
    direction: "inbound" as const,
    body: row.body.replace(/\s+/g, " ").trim().slice(0, 160),
    at: row.at,
  }));
  return [...digest, ...tail];
}

export function namesToHide(dossier: ConciergeDossier, travelers: EngineTraveler[]) {
  const names = new Set<string>();
  if (dossier.firstName.trim()) names.add(dossier.firstName.trim());
  for (const row of travelers) {
    const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    if (full) names.add(full);
    if (row.lastName?.trim()) names.add(row.lastName.trim());
  }
  return [...names].filter((name) => name.length > 2);
}

/** Destination, dates et numéro de vol public seulement. */
export function sanitizeWebQuery(query: string, hidden: string[]) {
  let text = query;
  const sorted = [...hidden].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    text = text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  text = text
    .replace(/\bTB-\d{4}-\d+\b/gi, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/(?:\+\d{1,3}|0[1-9])(?:[\s.\u00a0-]?\d){8,14}/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 240);
}

export function schengenPair(fromCode: string, toCode: string) {
  if (!fromCode || !toCode) return null;
  if (SCHENGEN.has(fromCode) && SCHENGEN.has(toCode)) return true;
  if (!SCHENGEN.has(fromCode) || !SCHENGEN.has(toCode)) return false;
  return null;
}

export function airportRule(fromCode: string, toCode: string) {
  const schengen = schengenPair(fromCode, toCode);
  if (schengen === true) {
    return "Règle générale : comptez deux heures avant un vol intérieur ou Schengen. Ce n’est pas un horaire de la compagnie.";
  }
  if (schengen === false) {
    return "Règle générale : comptez trois heures avant un vol international hors Schengen. Ce n’est pas un horaire de la compagnie.";
  }
  return "Règle générale : comptez trois heures avant le décollage quand le régime du vol n’est pas connu. Ce n’est pas un horaire de la compagnie.";
}

export function countryFromPlace(value: string) {
  const folded = foldEngine(value);
  if (/cancun|mayakoba|riviera maya|playa del carmen|tulum/.test(folded)) return "MX";
  const direct = resolveCountryCode(value);
  if (direct) return direct;
  for (const country of countriesForSelect(false)) {
    if (folded.includes(foldEngine(country.name))) return country.iso2;
  }
  return null;
}

export function formalityForCountry(iso: string) {
  const rule = entryForFrenchPassport(iso);
  const name = destinationCountryName(iso);
  const url = officialVisaApplyUrl(iso);
  let dit = `Règle générale, tableau au ${VISA_RULES_AS_OF} : `;
  if (rule.status === "none") dit += `un passeport français n’a pas de visa pour ${name}.`;
  else if (rule.status === "authorization") dit += `${rule.formality || "une autorisation"} est demandée pour ${name}.`;
  else if (rule.status === "visa") dit += `un visa est demandé pour ${name}.`;
  else dit += `la règle d’entrée pour ${name} n’est pas dans le tableau.`;
  dit += " L’agence vous confirme.";
  return {
    pays: name,
    iso,
    statut: rule.status,
    formalite: rule.formality,
    action: frenchEntryNeedsFormality(rule),
    url,
    dit,
  };
}

export function focusFlight(message: string, stays: EngineStayView[]) {
  const folded = foldEngine(message);
  const number = message.toUpperCase().match(/\b[A-Z]{1,3}\d{2,4}\b/);
  const flights = stays.flatMap((stay) => stay.vols);
  if (number && !flights.some((row) => row.numero.toUpperCase() === number[0])) return true;
  const places = ["paris", "nice", "rome", "cancun", "mayakoba"];
  const asked = places.filter((place) => folded.includes(place));
  if (asked.length >= 2) {
    const hit = flights.some((row) => {
      const blob = foldEngine(`${row.de} ${row.vers} ${row.deCode} ${row.versCode}`);
      return asked.every((place) => blob.includes(place));
    });
    if (!hit) return true;
  }
  return false;
}
