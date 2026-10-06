import { countryForIata } from "@/lib/crm/airports";
import { addIsoDays } from "@/lib/crm/dates";
import { countryIso, foldCountry } from "@/lib/crm/hotel-arrival";
import { resolveNationality } from "@/lib/crm/countries";
import { isActiveItem } from "@/lib/crm/types";
import {
  reusableDocumentsForTraveler,
  travelerDisplayName,
  tripDocumentsForTraveler,
} from "@/lib/crm/trip-documents";
import type { CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import type { PersonName } from "@/lib/crm/person-match";

/**
 * Territoires où l’ESTA est exigé (CBP : États-Unis, Porto Rico, Guam,
 * îles Vierges américaines, Mariannes du Nord).
 * Les Samoa américaines (AS) ont un régime d’entrée distinct : pas d’ESTA.
 */
export const ESTA_TERRITORY_ISO = new Set(["US", "PR", "VI", "GU", "MP"]);

/**
 * Visa Waiver Program, liste DHS (42 pays, octobre 2026).
 * Qatar est inclus. La Roumanie et la Bulgarie ne le sont pas.
 * Un passeport britannique (GB) est traité comme éligible : le droit de séjour
 * illimité au Royaume-Uni ne figure pas sur la nationalité.
 */
export const VWP_ISO = new Set([
  "AD", "AU", "AT", "BE", "BN", "CL", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IS", "IE", "IL", "IT", "JP", "KR", "LV", "LI", "LT", "LU", "MT", "MC", "NL",
  "NZ", "NO", "PL", "PT", "QA", "SM", "SG", "SK", "SI", "ES", "SE", "CH", "TW", "GB",
]);

export const ESTA_APPLY_URL = "https://esta.cbp.dhs.gov/";
export const ESTA_DAILY_HORIZON_DAYS = 90;
export const ESTA_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
export const ESTA_DISPATCH_GAP_MS = 15 * 60 * 1000;

export const ESTA_STATUSES = [
  "a_verifier",
  "approuve",
  "inacheve",
  "introuvable",
  "refuse",
  "en_attente",
  "non_concerne",
  "erreur",
] as const;

export type EstaStatus = (typeof ESTA_STATUSES)[number];

export type EstaAlert =
  | "expire_avant_retour"
  | "ancien_passeport"
  | "passeport_expire_avant_esta"
  | "passeport_expire_avant_retour";

export type EstaEligibility = "vwp" | "us" | "visa" | "unknown";

const TERRITORY_NAMES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  "etats unis": "US",
  "etats-unis": "US",
  hawaii: "US",
  alaska: "US",
  "puerto rico": "PR",
  "porto rico": "PR",
  pr: "PR",
  guam: "GU",
  gu: "GU",
  "virgin islands": "VI",
  "us virgin islands": "VI",
  "u s virgin islands": "VI",
  "iles vierges": "VI",
  "iles vierges americaines": "VI",
  "iles vierges des etats unis": "VI",
  vi: "VI",
  "northern mariana islands": "MP",
  "northern marianas": "MP",
  "iles mariannes": "MP",
  "iles mariannes du nord": "MP",
  "commonwealth of the northern mariana islands": "MP",
  mp: "MP",
  "american samoa": "AS",
  "samoa americaines": "AS",
  as: "AS",
};

const STOP_KEYS = [
  "via",
  "stop",
  "stops",
  "layover",
  "layovers",
  "connection",
  "connections",
  "connection_airport",
  "escale",
  "escales",
] as const;

export function isoDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function formatEstaDate(value: string | null | undefined) {
  const day = isoDay(value);
  if (!day) return null;
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

export function passportLast3(value: string | null | undefined) {
  const clean = String(value || "").replace(/[^A-Za-z0-9]/g, "");
  if (clean.length < 3) return null;
  return clean.slice(-3).toUpperCase();
}

export function maskPassportNumber(value: string) {
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 3) return "•••";
  return `${"•".repeat(Math.max(0, clean.length - 3))}${clean.slice(-3)}`;
}

/** Masque un numéro connu dans un texte. Les 3 derniers caractères restent lisibles. */
export function maskPassportInText(text: string, numbers: string[]) {
  let out = text;
  for (const number of numbers) {
    const clean = number.replace(/\s+/g, "");
    if (clean.length < 4) continue;
    const masked = maskPassportNumber(clean);
    if (number !== clean) out = out.split(number).join(masked);
    out = out.split(clean).join(masked);
  }
  return out;
}

function detailString(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushIata(found: string[], raw: string) {
  for (const match of raw.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
}

function walkIata(value: unknown, found: string[], depth: number) {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    pushIata(found, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkIata(item, found, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["to", "via", "stop", "stops", "iata", "code", "airport", "destination", ...STOP_KEYS]) {
      if (key in row) walkIata(row[key], found, depth + 1);
    }
  }
}

function iataCodes(value: unknown) {
  const found: string[] = [];
  walkIata(value, found, 0);
  return found;
}

/** Arrivée et escales d’un vol. Le départ seul ne compte pas. */
export function flightTouchIatas(details: Record<string, unknown> | null | undefined) {
  const found: string[] = [];
  const add = (codes: string[]) => {
    for (const code of codes) if (!found.includes(code)) found.push(code);
  };
  add(iataCodes(detailString(details, "to")));
  for (const key of STOP_KEYS) add(iataCodes(details?.[key]));
  const route = iataCodes(detailString(details, "route"));
  add(route.slice(1));
  const segments = details?.segments;
  if (Array.isArray(segments)) {
    for (const segment of segments) add(iataCodes(segment));
  }
  return found;
}

export function territoryFromCountry(country: string | null | undefined) {
  const folded = foldCountry(country || "");
  if (!folded) return null;
  if (TERRITORY_NAMES[folded]) return TERRITORY_NAMES[folded];
  return countryIso(country || "");
}

export function isEstaTerritory(iso: string | null | undefined) {
  return Boolean(iso && ESTA_TERRITORY_ISO.has(iso));
}

export function hotelInEstaTerritory(details: Record<string, unknown> | null | undefined) {
  const iso = territoryFromCountry(detailString(details, "country"));
  return isEstaTerritory(iso);
}

export function itemTouchesEsta(item: { kind?: string | null; lifecycle?: string | null; details?: Record<string, unknown> | null }) {
  if (!isActiveItem(item)) return false;
  if (item.kind === "flight") {
    return flightTouchIatas(item.details).some((code) => isEstaTerritory(countryForIata(code)));
  }
  if (item.kind === "hotel") return hotelInEstaTerritory(item.details);
  return false;
}

export function estaAirports(item: { kind?: string | null; lifecycle?: string | null; details?: Record<string, unknown> | null }) {
  if (!isActiveItem(item) || item.kind !== "flight") return [];
  return flightTouchIatas(item.details).filter((code) => isEstaTerritory(countryForIata(code)));
}

export function tripNeedsEsta(items: { kind?: string | null; lifecycle?: string | null; details?: Record<string, unknown> | null }[] | null | undefined) {
  return (items || []).some((item) => itemTouchesEsta(item));
}

export function tripEstaDates(
  items: { kind?: string | null; lifecycle?: string | null; start_at?: string | null; end_at?: string | null; details?: Record<string, unknown> | null }[] | null | undefined,
  booking: { start_date?: string | null; end_date?: string | null }
) {
  const active = (items || []).filter((item) => isActiveItem(item));
  const ends = active.map((item) => isoDay(item.end_at)).filter((day): day is string => Boolean(day));
  return {
    needsEsta: tripNeedsEsta(active),
    departure: isoDay(booking.start_date) || active.map((item) => isoDay(item.start_at)).filter((day): day is string => Boolean(day)).sort()[0] || null,
    returnOn: isoDay(booking.end_date) || ends.sort().at(-1) || null,
  };
}

export function estaEligibility(nationality: string | null | undefined, issuingCountry?: string | null): EstaEligibility {
  const iso = resolveNationality(nationality, issuingCountry);
  if (!iso) return "unknown";
  if (iso === "US") return "us";
  if (VWP_ISO.has(iso)) return "vwp";
  return "visa";
}

export function passportForEsta(
  traveler: CrmBookingTraveler,
  docs: CrmTravelDocument[],
  holder?: PersonName | null
) {
  const seen = new Set<string>();
  const pool = [...tripDocumentsForTraveler(docs, traveler), ...reusableDocumentsForTraveler(docs, traveler, holder)]
    .filter((doc) => doc.doc_type === "passport" && !seen.has(doc.id) && seen.add(doc.id));
  pool.sort((a, b) => (b.expires_on || "").localeCompare(a.expires_on || ""));
  return pool[0] || null;
}

export function estaAlerts(input: {
  status: EstaStatus;
  validUntil?: string | null;
  returnOn?: string | null;
  passportExpires?: string | null;
  passportNumber?: string | null;
  estaPassportLast3?: string | null;
}): EstaAlert[] {
  const alerts: EstaAlert[] = [];
  const valid = isoDay(input.validUntil);
  const back = isoDay(input.returnOn);
  const expires = isoDay(input.passportExpires);
  if (input.status === "approuve" && valid && back && valid < back) alerts.push("expire_avant_retour");
  const current = passportLast3(input.passportNumber);
  const bound = passportLast3(input.estaPassportLast3);
  if (bound && current && bound !== current) alerts.push("ancien_passeport");
  if (expires && valid && expires < valid) alerts.push("passeport_expire_avant_esta");
  if (expires && back && expires < back) alerts.push("passeport_expire_avant_retour");
  return alerts;
}

export function estaCoversTrip(status: EstaStatus, alerts: EstaAlert[]) {
  if (status !== "approuve") return false;
  return !alerts.some((alert) =>
    alert === "expire_avant_retour" ||
    alert === "ancien_passeport" ||
    alert === "passeport_expire_avant_esta" ||
    alert === "passeport_expire_avant_retour"
  );
}

const BADGE: Record<EstaStatus, string> = {
  a_verifier: "À vérifier",
  approuve: "Valable",
  inacheve: "Inachevé",
  introuvable: "Introuvable",
  refuse: "Refusé",
  en_attente: "En attente",
  non_concerne: "Visa / non concerné",
  erreur: "Erreur",
};

export function estaBadge(input: { status: EstaStatus; validUntil?: string | null; alerts: EstaAlert[] }) {
  if (input.status === "non_concerne") return { label: BADGE.non_concerne, tone: "muted" as const };
  if (input.alerts.includes("ancien_passeport")) return { label: "Lié à un ancien passeport", tone: "warn" as const };
  if (input.status === "approuve" && input.alerts.includes("expire_avant_retour")) {
    return { label: "Expire avant le retour", tone: "warn" as const };
  }
  if (input.status === "approuve") {
    const date = formatEstaDate(input.validUntil);
    return { label: date ? `Valable jusqu’au ${date}` : "Valable", tone: "ok" as const };
  }
  const tone = input.status === "a_verifier" || input.status === "refuse" || input.status === "inacheve" || input.status === "introuvable" || input.status === "erreur"
    ? "warn" as const
    : "muted" as const;
  return { label: BADGE[input.status], tone };
}

export function estaPassportCaption(alerts: EstaAlert[], passportExpires?: string | null) {
  const date = formatEstaDate(passportExpires);
  if (alerts.includes("passeport_expire_avant_retour")) {
    return date ? `Passeport expire le ${date}, avant le retour` : "Passeport expire avant le retour";
  }
  if (alerts.includes("passeport_expire_avant_esta")) {
    return date ? `Passeport expire le ${date}, avant la fin de l’ESTA` : "Passeport expire avant la fin de l’ESTA";
  }
  return null;
}

export function estaCheckedLabel(checkedAt: string | null | undefined) {
  const date = formatEstaDate(checkedAt);
  return date ? `Vérifié le ${date}` : "Pas encore vérifié";
}

export function estaNoteCaption(note: string | null | undefined, passportNumbers: string[] = []) {
  const clean = maskPassportInText(String(note || "").replace(/\s+/g, " ").trim(), passportNumbers);
  if (!clean || clean.length > 80) return null;
  if (/\d{6,}/.test(clean.replace(/\s/g, ""))) return null;
  return clean;
}

export type EstaWebhookBody = {
  id: string;
  booking_id: string;
  traveler_id: string;
  departure_date: string | null;
  kind: "esta";
};

/** Identifiants seuls. Jamais le passeport, la MRZ ou la date de naissance. */
export function estaWebhookBody(input: {
  id: string;
  bookingId: string;
  travelerId: string;
  departureDate?: string | null;
}): EstaWebhookBody {
  return {
    id: input.id,
    booking_id: input.bookingId,
    traveler_id: input.travelerId,
    departure_date: isoDay(input.departureDate),
    kind: "esta",
  };
}

export function estaWebhookHeader(key: string, headerName?: string | null) {
  const name = (headerName || "").trim() || "Authorization";
  const value = name.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
  return { name, value };
}

export function estaWebhookConfigured(url?: string | null, key?: string | null) {
  return Boolean((url || "").trim() && (key || "").trim());
}

export function estaClientAutoSend(value?: string | null) {
  const flag = (value || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "oui";
}

export function estaDispatchDue(input: {
  desiredKey: string | null;
  storedKey: string | null;
  dispatchedAt?: string | null;
  attemptAt?: string | null;
  nowMs: number;
}) {
  if (!input.desiredKey) return false;
  if (input.desiredKey !== (input.storedKey || null)) return true;
  if (input.dispatchedAt) return false;
  if (!input.attemptAt) return true;
  const attempt = Date.parse(input.attemptAt);
  if (!Number.isFinite(attempt)) return true;
  return input.nowMs - attempt >= ESTA_DISPATCH_GAP_MS;
}

export type EstaStored = {
  status: EstaStatus;
  documentId: string | null;
  dispatchKey: string | null;
};

export type EstaPlan = {
  status: EstaStatus;
  documentId: string | null;
  dispatchKey: string | null;
  clearResult: boolean;
};

/**
 * Une ligne par voyageur. `null` : ne rien écrire (résultat déjà bon, ou pas de passeport).
 * La clé d’envoi change au nouveau segment, au changement de passeport, ou au clic.
 */
export function planEstaCheck(input: {
  tripNeedsEsta: boolean;
  passport: { id: string; nationality: string | null; issuingCountry?: string | null } | null;
  previous: EstaStored | null;
  manualStamp?: string | null;
}): EstaPlan | null {
  const manualKey = input.manualStamp ? `manual:${input.manualStamp}` : null;
  if (!input.tripNeedsEsta) {
    if (!input.previous || input.previous.status !== "a_verifier") return null;
    return {
      status: "non_concerne",
      documentId: input.previous.documentId,
      dispatchKey: null,
      clearResult: false,
    };
  }
  if (!input.passport) return null;
  const eligibility = estaEligibility(input.passport.nationality, input.passport.issuingCountry);
  if (eligibility === "us" || eligibility === "visa") {
    return {
      status: "non_concerne",
      documentId: input.passport.id,
      dispatchKey: null,
      clearResult: false,
    };
  }
  const autoKey = `auto:${input.passport.id}`;
  const docChanged = Boolean(input.previous && input.previous.documentId !== input.passport.id);
  if (!input.previous || docChanged || input.previous.status === "non_concerne") {
    return {
      status: "a_verifier",
      documentId: input.passport.id,
      dispatchKey: manualKey || autoKey,
      clearResult: docChanged,
    };
  }
  if (manualKey) {
    return {
      status: "a_verifier",
      documentId: input.passport.id,
      dispatchKey: manualKey,
      clearResult: false,
    };
  }
  if (input.previous.status === "a_verifier") {
    return {
      status: "a_verifier",
      documentId: input.passport.id,
      dispatchKey: input.previous.dispatchKey || autoKey,
      clearResult: false,
    };
  }
  return null;
}

export function estaOnDailyList(input: {
  departure: string | null;
  today: string;
  status: EstaStatus;
  checkedAt?: string | null;
  validUntil?: string | null;
  returnOn?: string | null;
  passportNumber?: string | null;
  estaPassportLast3?: string | null;
  nowMs: number;
}) {
  const departure = isoDay(input.departure);
  const today = isoDay(input.today);
  if (!departure || !today) return false;
  if (input.status === "non_concerne") return false;
  if (departure < today || departure > addIsoDays(today, ESTA_DAILY_HORIZON_DAYS)) return false;
  if (input.status === "a_verifier") return true;
  if (!input.checkedAt) return true;
  const alerts = estaAlerts({
    status: input.status,
    validUntil: input.validUntil,
    returnOn: input.returnOn,
    passportNumber: input.passportNumber,
    estaPassportLast3: input.estaPassportLast3,
  });
  if (alerts.includes("expire_avant_retour") || alerts.includes("ancien_passeport")) return true;
  if (input.status === "approuve") return false;
  const checked = Date.parse(input.checkedAt);
  if (!Number.isFinite(checked)) return true;
  return input.nowMs - checked > ESTA_RECHECK_MS;
}

export function estaClientDraft(input: {
  status: EstaStatus;
  validUntil?: string | null;
  alerts: EstaAlert[];
  reference?: string | null;
  passportExpires?: string | null;
}) {
  if (input.status === "non_concerne" || input.status === "erreur") return null;
  const date = formatEstaDate(input.validUntil);
  const link = ESTA_APPLY_URL;
  let body: string | null = null;
  if (input.alerts.includes("ancien_passeport")) {
    body = `Votre ESTA est lié à un ancien passeport. Faites-en un nouveau sur ${link} au moins 72 h avant le départ.`;
  } else if (input.status === "refuse") {
    body = `Votre demande d’ESTA a été refusée. Le site officiel est ${link}. L’agence revient vers vous.`;
  } else if (input.status === "approuve" && input.alerts.includes("expire_avant_retour") && date) {
    body = `Votre ESTA est valable jusqu’au ${date}, avant la fin de votre séjour. Il faudra le renouveler sur ${link} au moins 72 h avant le départ.`;
  } else if (input.status === "approuve" && date) {
    body = `Votre ESTA est valable jusqu’au ${date}.`;
  } else if (
    input.status === "a_verifier" ||
    input.status === "inacheve" ||
    input.status === "introuvable" ||
    input.status === "en_attente"
  ) {
    body = `Votre ESTA est manquant ou inachevé. Faites-le sur ${link} au moins 72 h avant le départ.`;
  }
  if (!body) return null;
  if (input.alerts.includes("passeport_expire_avant_retour")) {
    const expires = formatEstaDate(input.passportExpires);
    body += expires ? ` Votre passeport expire le ${expires}, avant le retour.` : " Votre passeport expire avant le retour.";
  } else if (input.alerts.includes("passeport_expire_avant_esta")) {
    const expires = formatEstaDate(input.passportExpires);
    body += expires
      ? ` Votre passeport expire le ${expires}, avant la fin de validité de l’ESTA.`
      : " Votre passeport expire avant la fin de validité de l’ESTA.";
  }
  const reference = (input.reference || "").trim() || "votre séjour";
  return {
    subject: `Votre ESTA — ${reference}`,
    text: `Bonjour,\n\n${body}\n\nL’agence`,
  };
}

export function estaAgencyDraft(input: {
  reference: string;
  travelerName: string;
  status: EstaStatus;
  validUntil?: string | null;
  alerts: EstaAlert[];
  href: string;
}) {
  const name = input.travelerName.trim() || "Un voyageur";
  const reference = input.reference.trim() || "Dossier";
  const covers = estaCoversTrip(input.status, input.alerts);
  const date = formatEstaDate(input.validUntil);
  const lines = [`${name}`, `Dossier ${reference}`, BADGE[input.status]];
  if (date && input.status === "approuve") lines.push(`Valable jusqu’au ${date}`);
  if (input.alerts.includes("expire_avant_retour")) lines.push("L’ESTA expire avant le retour.");
  if (input.alerts.includes("ancien_passeport")) lines.push("L’ESTA est lié à un autre passeport.");
  if (input.alerts.includes("passeport_expire_avant_esta")) lines.push("Le passeport expire avant la fin de l’ESTA.");
  if (input.alerts.includes("passeport_expire_avant_retour")) lines.push("Le passeport expire avant le retour.");
  const subject = covers
    ? `ESTA · ${reference} · ${name} · valable${date ? ` jusqu’au ${date}` : ""}`
    : `ESTA · ${reference} · ${name} · à traiter`;
  const intro = covers
    ? `L’ESTA de ${name} est valable${date ? ` jusqu’au ${date}` : ""} et couvre le séjour.`
    : `L’ESTA de ${name} n’est pas approuvé pour tout le séjour.`;
  return {
    kind: covers ? "valable" as const : "alerte" as const,
    subject,
    text: [intro, ...lines, input.href].join("\n"),
    intro,
  };
}

export type EstaTravelerLine = {
  travelerId: string;
  name: string;
  badge: string;
  tone: "ok" | "warn" | "muted";
  checkedLabel: string;
  caption: string | null;
  canVerify: boolean;
  canSend: boolean;
  sent: boolean;
};

export function estaTravelerLine(input: {
  traveler: CrmBookingTraveler;
  status: EstaStatus;
  validUntil?: string | null;
  checkedAt?: string | null;
  note?: string | null;
  returnOn?: string | null;
  passport: CrmTravelDocument | null;
  estaPassportLast3?: string | null;
  clientSentAt?: string | null;
}): EstaTravelerLine {
  const alerts = estaAlerts({
    status: input.status,
    validUntil: input.validUntil,
    returnOn: input.returnOn,
    passportExpires: input.passport?.expires_on,
    passportNumber: input.passport?.number,
    estaPassportLast3: input.estaPassportLast3,
  });
  const badge = estaBadge({ status: input.status, validUntil: input.validUntil, alerts });
  const caption =
    estaPassportCaption(alerts, input.passport?.expires_on) ||
    estaNoteCaption(input.note, input.passport?.number ? [input.passport.number] : []);
  const draft = estaClientDraft({
    status: input.status,
    validUntil: input.validUntil,
    alerts,
    passportExpires: input.passport?.expires_on,
  });
  return {
    travelerId: input.traveler.id,
    name: travelerDisplayName(input.traveler),
    badge: badge.label,
    tone: badge.tone,
    checkedLabel: estaCheckedLabel(input.checkedAt),
    caption,
    canVerify: input.status !== "non_concerne",
    canSend: Boolean(draft) && !input.clientSentAt,
    sent: Boolean(input.clientSentAt),
  };
}

export function isEstaStatus(value: string | null | undefined): value is EstaStatus {
  return Boolean(value && (ESTA_STATUSES as readonly string[]).includes(value));
}

export function touchingBookingItems(items: Pick<CrmBookingItem, "kind" | "lifecycle" | "details">[]) {
  return items.filter((item) => itemTouchesEsta(item));
}
