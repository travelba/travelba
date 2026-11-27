import { countriesForSelect, resolveCountryCode } from "@/lib/crm/countries";
import { addIsoDays } from "@/lib/crm/dates";
import { frenchLongDate } from "@/lib/crm/concierge-when";
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
  fuseau: string;
  etat: "a_venir" | "passe";
  acteur: string;
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
  actor?: string;
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

/** Instant du départ, heure murale du fuseau. Null sans date ou sans heure. */
export function wallInstant(date: string | null, clock: string, timeZone: string): Date | null {
  const match = /^(\d{2})h(\d{2})$/.exec(clock || "");
  if (!date || !match) return null;
  const zone = timeZone || "Europe/Paris";
  const [year, month, day] = date.split("-").map(Number);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!year || !month || !day || hour > 23 || minute > 59) return null;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  let formatted: Intl.DateTimeFormatPart[];
  try {
    formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(utcGuess);
  } catch {
    return utcGuess;
  }
  const part = (type: string) => Number(formatted.find((row) => row.type === type)?.value || "0");
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour") % 24, part("minute"), part("second"));
  return new Date(utcGuess.getTime() - (asUtc - utcGuess.getTime()));
}

/** Passé dès que l’instant de départ est atteint. Sans heure, le jour civil de Paris décide. */
export function segmentEtat(date: string | null, clock: string, timeZone: string, now: Date): "a_venir" | "passe" {
  const instant = wallInstant(date, clock, timeZone);
  if (instant) return instant.getTime() <= now.getTime() ? "passe" : "a_venir";
  if (!date) return "a_venir";
  return date < parisDay(now) ? "passe" : "a_venir";
}

/** « Aujourd’hui » et « demain » se lisent à Paris, et seulement s’ils tombent juste. */
export function parisDayWord(date: string | null, now: Date): "aujourd'hui" | "demain" | null {
  if (!date) return null;
  const today = parisDay(now);
  if (date === today) return "aujourd'hui";
  if (date === addIsoDays(today, 1)) return "demain";
  return null;
}

export function sortFlights(rows: EngineFlight[]) {
  return [...rows].sort((a, b) =>
    `${a.date || "9999"}T${a.heureLocale || "99h99"}`.localeCompare(`${b.date || "9999"}T${b.heureLocale || "99h99"}`)
  );
}

export function nextSegment(rows: EngineFlight[]) {
  return sortFlights(rows.filter((row) => row.etat === "a_venir"))[0] || null;
}

export function describeSegment(row: EngineFlight, now: Date) {
  const absolute = row.date ? frenchLongDate(row.date) : "date inconnue";
  const word = parisDayWord(row.date, now);
  const when = word ? `le ${absolute} (${word})` : `le ${absolute}`;
  const zone = row.fuseau || "Europe/Paris";
  const same = zone === "Europe/Paris" || !row.heureLocale || !row.heureParis || row.heureParis === row.heureLocale;
  const heure = !row.heureLocale
    ? ""
    : same
      ? ` à ${row.heureLocale}, heure locale et heure de Paris (Europe/Paris)`
      : ` à ${row.heureLocale} heure locale (${zone}), ${row.heureParis} heure de Paris (Europe/Paris)`;
  const route = [row.de, row.vers].filter(Boolean).join(" vers ");
  const num = row.numero ? `${row.numero} ` : "";
  const place = route ? `${num}${route}` : num.trim() || "vol";
  return `${place}, ${when}${heure}`.replace(/\s+/g, " ").trim();
}

/** Le retour est daté avant l’aller. On le dit, on ne le réinterprète pas. */
export function flightAnomaly(flights: EngineFlight[]) {
  const aller = flights.find((row) => row.sens === "aller");
  const retour = flights.find((row) => row.sens === "retour");
  if (!aller?.date || !retour?.date) return null;
  const left = `${aller.date}T${aller.heureLocale || "00h00"}`;
  const right = `${retour.date}T${retour.heureLocale || "00h00"}`;
  if (right >= left) return null;
  const outbound = frenchLongDate(aller.date);
  const inbound = frenchLongDate(retour.date);
  return `Le retour${retour.numero ? ` ${retour.numero}` : ""} du ${inbound} est daté avant l’aller${aller.numero ? ` ${aller.numero}` : ""} du ${outbound}.`;
}

export function upcomingFlightSentence(row: EngineFlight, now: Date) {
  return `Votre prochain vol ${describeSegment(row, now)}.`;
}

export function pastFlightsSentence(rows: EngineFlight[], now: Date) {
  const last = sortFlights(rows.filter((row) => row.etat === "passe")).at(-1);
  if (!last) return "Je n’ai pas de vol dans votre dossier.";
  return `Tous les vols de votre dossier sont déjà passés. Le dernier était ${describeSegment(last, now)}.`;
}

export function terminalSentence(rows: EngineFlight[], now: Date) {
  const next = nextSegment(rows);
  if (!next) return "Tous les vols sont déjà passés. Je ne donne pas le terminal d’un segment passé.";
  if (!next.terminal) {
    return `Je n’ai pas le terminal du prochain vol${next.numero ? ` ${next.numero}` : ""} dans votre dossier.`;
  }
  const absolute = next.date ? frenchLongDate(next.date) : "date inconnue";
  const word = parisDayWord(next.date, now);
  const when = word ? `le ${absolute} (${word})` : `le ${absolute}`;
  return `Le terminal du prochain vol${next.numero ? ` ${next.numero}` : ""}, ${when}, est ${next.terminal}.`;
}

function parisStamp(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((row) => row.type === type)?.value || "";
  const iso = get("year") && get("month") && get("day") ? `${get("year")}-${get("month")}-${get("day")}` : "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  if (!iso || !hour || !get("minute")) return "";
  return `${frenchLongDate(iso)} à ${hour}h${get("minute")}`;
}

export function checkinWindowPhrase(row: Pick<EngineFlight, "date" | "heureLocale" | "fuseau">, now: Date) {
  const instant = wallInstant(row.date, row.heureLocale, row.fuseau);
  if (!instant) return "";
  const opens = new Date(instant.getTime() - 24 * 60 * 60 * 1000);
  const label = parisStamp(opens);
  if (!label) return "";
  const state = opens.getTime() <= now.getTime() ? "elle est ouverte" : "elle n’est pas encore ouverte";
  return `Fenêtre, règle générale, 24 h avant : ${label} (Europe/Paris), ${state}.`;
}

function lowerFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleLowerCase("fr") + value.slice(1);
}

/** Phrase client : seulement ce que le dossier dit. Sans engagement si rien n’est prévu. */
export function checkinClientLine(row: EngineFlight, now: Date) {
  const vol = row.numero || "Le vol";
  const cards = row.cartes ? "Les cartes d’embarquement sont déposées." : "";
  const window = checkinWindowPhrase(row, now);
  const label = row.enregistrement || "Non renseigné";
  if (label === "Non renseigné") {
    return `${vol} : l’enregistrement n’est pas renseigné. ${cards}Je peux transmettre la demande à l’agence, sans engagement.`
      .replace(/\s+/g, " ")
      .trim();
  }
  if (/fait|reçues|envoyées/i.test(label)) {
    return `${vol} : ${lowerFirst(label)}. ${cards}`.replace(/\s+/g, " ").trim();
  }
  const who =
    row.acteur === "agence"
      ? "L’agence s’occupe de l’enregistrement."
      : row.acteur === "bot"
        ? "L’enregistrement en ligne est prévu."
        : "Je peux transmettre la demande à l’agence, sans engagement.";
  return `${vol} : ${lowerFirst(label)}. ${window} ${cards}${who}`.replace(/\s+/g, " ").trim();
}

export function checkinReply(rows: EngineFlight[], now: Date) {
  const next = nextSegment(rows);
  if (!next) {
    const last = sortFlights(rows.filter((row) => row.etat === "passe")).at(-1);
    if (!last) return "Aucun vol dans le dossier. Je peux transmettre la demande à l’agence, sans engagement.";
    return `Les vols sont déjà passés. ${checkinClientLine(last, now)}`;
  }
  return checkinClientLine(next, now);
}

/** Numéro, date, heures locale et de Paris, terminal. Le correcteur s’en sert pour les heures du dossier. */
export function flightFactText(dossier: { stays: { items: ConciergeItem[] }[] }) {
  const lines: string[] = [];
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (item.kind !== "flight" && !item.flightNumber) continue;
      const zone = item.timezone || "Europe/Paris";
      const paris = clockInParis(item.date, item.clock, zone);
      const arrivalParis = item.arrival ? clockInParis(item.endDate || item.date, item.arrival, zone) : "";
      lines.push(
        [
          item.flightNumber,
          item.date ? frenchLongDate(item.date) : "",
          item.clock,
          paris && paris !== item.clock ? paris : "",
          item.arrival,
          arrivalParis && arrivalParis !== item.arrival ? arrivalParis : "",
          item.terminal ? `terminal ${item.terminal}` : "",
          zone,
          item.fromPlace,
          item.toPlace,
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
  }
  return lines.join("\n");
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

function flightsOf(stay: ConciergeStay, checkins: EngineCheckin[], cards: boolean, now: Date): EngineFlight[] {
  const rows = stay.items.filter((item) => item.kind === "flight" || item.flightNumber);
  const mapped: EngineFlight[] = rows.map((item) => {
    const check = checkins.find((row) => row.flightNumber && row.flightNumber === item.flightNumber);
    const zone = item.timezone || "Europe/Paris";
    return {
      sens: "autre" as const,
      numero: item.flightNumber,
      de: item.fromPlace,
      vers: item.toPlace,
      deCode: item.fromCode,
      versCode: item.toCode,
      date: item.date,
      heureLocale: item.clock,
      heureParis: clockInParis(item.date, item.clock, zone),
      arriveeLocale: item.arrival,
      terminal: item.terminal,
      enregistrement: checkinLabel(check?.status || "a_faire"),
      cartes: cards,
      fuseau: zone,
      etat: segmentEtat(item.date, item.clock, zone, now),
      acteur: check?.actor === "agence" || check?.actor === "bot" ? check.actor : "",
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
      vols: flightsOf(stay, checkins, cards, input.now),
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
