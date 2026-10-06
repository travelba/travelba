import { countryForIata } from "@/lib/crm/airports";
import { addIsoDays } from "@/lib/crm/dates";
import { countryIso, foldCountry } from "@/lib/crm/hotel-arrival";
import { resolveNationality } from "@/lib/crm/countries";
import { isActiveItem } from "@/lib/crm/types";
import {
  formatEstaDate,
  isoDay,
  maskPassportInText,
  passportForEsta,
  passportLast3,
} from "@/lib/crm/esta";
import {
  ukEtaFeedback,
  type UkEtaStatus,
  type UkEtaTravelerLine,
} from "@/lib/crm/uk-eta-ui";
import type { CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

export {
  ukEtaCheckedLabel,
  ukEtaFeedback,
  UK_ETA_PENDING_STALE_MS,
  UK_ETA_POLL_MS,
  UK_ETA_POLL_WINDOW_MS,
  UK_ETA_STATUSES,
  isUkEtaStatus,
} from "@/lib/crm/uk-eta-ui";
export type { UkEtaStatus, UkEtaTravelerLine } from "@/lib/crm/uk-eta-ui";

export const UK_ETA_APPLY_URL = "https://www.gov.uk/eta";
export const UK_ETA_CHECK_URL = "https://check-your-travel-permission.homeoffice.gov.uk";
export const UK_ETA_DAILY_HORIZON_DAYS = 90;
export const UK_ETA_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
export const UK_ETA_DISPATCH_GAP_MS = 15 * 60 * 1000;

/** Nationalités dispensées d’ETA (citoyens britanniques et irlandais). */
export const UK_ETA_EXEMPT_ISO = new Set(["GB", "IE"]);

export type UkEtaAlert =
  | "expire_avant_retour"
  | "ancien_passeport"
  | "passeport_expire_avant_eta"
  | "passeport_expire_avant_retour";

const UK_PHRASES = [
  "united kingdom",
  "royaume uni",
  "grande bretagne",
  "great britain",
  "angleterre",
  "england",
  "ecosse",
  "scotland",
  "pays de galles",
  "northern ireland",
  "irlande du nord",
  "st pancras",
  "saint pancras",
  "ashford international",
  "ebbsfleet",
  "heathrow",
  "gatwick",
  "stansted",
  "london city",
];

const UK_CITIES = [
  "london",
  "londres",
  "edinburgh",
  "edimbourg",
  "manchester",
  "birmingham",
  "glasgow",
  "belfast",
  "liverpool",
  "bristol",
  "cardiff",
  "oxford",
  "cambridge",
  "leeds",
  "newcastle",
  "aberdeen",
  "inverness",
  "brighton",
  "windsor",
  "bath",
  "york",
];

const UK_AIRPORT_TEXT =
  /\b(?:LHR|LGW|LCY|STN|LTN|SEN|MAN|BHX|EDI|GLA|BFS|BHD|NCL|LPL|BRS|CWL|SOU|EMA|LBA|ABZ|INV|EXT|BOH)\b/;

const CITY_TEXT = new RegExp(`\\b(?:${UK_CITIES.join("|")})\\b`);

const ROUTE_KEYS = [
  "from",
  "to",
  "via",
  "stop",
  "stops",
  "iata",
  "code",
  "airport",
  "destination",
  "origin",
  "departure",
  "arrival",
  "city_from",
  "city_to",
  "route",
  "connection",
  "connections",
  "connection_airport",
  "escale",
  "escales",
  "station",
  "departure_station",
  "arrival_station",
  "segments",
] as const;

const HOTEL_TEXT_KEYS = ["city", "address", "hotel_name", "name", "country"] as const;

type StayItem = {
  kind?: string | null;
  lifecycle?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
  start_at?: string | null;
  end_at?: string | null;
};

function detailString(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushCodes(raw: string, found: string[]) {
  for (const match of raw.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
}

function walkCodes(value: unknown, found: string[], depth: number) {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    pushCodes(value, found);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkCodes(item, found, depth + 1);
    return;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ROUTE_KEYS) {
      if (key in row) walkCodes(row[key], found, depth + 1);
    }
  }
}

function routeIatas(details: Record<string, unknown> | null | undefined) {
  const found: string[] = [];
  walkCodes(details, found, 0);
  return found;
}

export function textMentionsUk(value: string | null | undefined) {
  const raw = String(value || "");
  const folded = foldCountry(raw);
  if (!folded) return false;
  if (UK_PHRASES.some((phrase) => folded.includes(phrase))) return true;
  const scrubbed = folded.replace(/\bnew york\b/g, " ").replace(/\blondon ontario\b/g, " ");
  if (CITY_TEXT.test(scrubbed)) return true;
  return UK_AIRPORT_TEXT.test(raw.toUpperCase());
}

function stringsOf(details: Record<string, unknown> | null | undefined, keys: readonly string[]) {
  const found: string[] = [];
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === "string" && value.trim()) found.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) found.push(item);
      }
    }
  }
  return found;
}

export function itemMentionsUk(item: StayItem) {
  if (!isActiveItem(item)) return false;
  if (item.kind === "flight" || item.kind === "rail") {
    if (routeIatas(item.details).some((code) => countryForIata(code) === "GB")) return true;
    if (textMentionsUk(item.title)) return true;
    return stringsOf(item.details, ROUTE_KEYS).some((value) => textMentionsUk(value));
  }
  if (item.kind === "hotel") {
    const iso = countryIso(detailString(item.details, "country") || "");
    if (iso === "GB") return true;
    if (iso && iso !== "GB") return false;
    if (textMentionsUk(item.title)) return true;
    return stringsOf(item.details, HOTEL_TEXT_KEYS).some((value) => textMentionsUk(value));
  }
  return false;
}

/** Vol, train (Eurostar) ou hôtel au Royaume-Uni, ou destination / titre du dossier. */
export function tripNeedsUkEta(
  booking: { destination?: string | null; title?: string | null },
  items: StayItem[] | null | undefined
) {
  const stay = (items || []).filter(
    (item) => isActiveItem(item) && (item.kind === "flight" || item.kind === "rail" || item.kind === "hotel")
  );
  if (!stay.length) return false;
  if (textMentionsUk(booking.destination) || textMentionsUk(booking.title)) return true;
  return stay.some((item) => itemMentionsUk(item));
}

export function tripUkEtaDates(
  items: StayItem[] | null | undefined,
  booking: { destination?: string | null; title?: string | null; start_date?: string | null; end_date?: string | null }
) {
  const active = (items || []).filter((item) => isActiveItem(item));
  const ends = active.map((item) => isoDay(item.end_at)).filter((day): day is string => Boolean(day));
  return {
    needsUkEta: tripNeedsUkEta(booking, active),
    departure:
      isoDay(booking.start_date) ||
      active.map((item) => isoDay(item.start_at)).filter((day): day is string => Boolean(day)).sort()[0] ||
      null,
    returnOn: isoDay(booking.end_date) || ends.sort().at(-1) || null,
  };
}

export function ukEtaExempt(nationality: string | null | undefined, issuingCountry?: string | null) {
  const iso = resolveNationality(nationality, issuingCountry);
  return Boolean(iso && UK_ETA_EXEMPT_ISO.has(iso));
}

export { passportForEsta };

export function ukEtaAlerts(input: {
  status: UkEtaStatus;
  validUntil?: string | null;
  returnOn?: string | null;
  passportExpires?: string | null;
  passportNumber?: string | null;
  passportLast3?: string | null;
}): UkEtaAlert[] {
  const alerts: UkEtaAlert[] = [];
  const valid = isoDay(input.validUntil);
  const back = isoDay(input.returnOn);
  const expires = isoDay(input.passportExpires);
  if (input.status === "approuve" && valid && back && valid < back) alerts.push("expire_avant_retour");
  const current = passportLast3(input.passportNumber);
  const bound = passportLast3(input.passportLast3);
  if (bound && current && bound !== current) alerts.push("ancien_passeport");
  if (expires && valid && expires < valid) alerts.push("passeport_expire_avant_eta");
  if (expires && back && expires < back) alerts.push("passeport_expire_avant_retour");
  return alerts;
}

export function ukEtaCoversTrip(status: UkEtaStatus, alerts: UkEtaAlert[]) {
  if (status !== "approuve") return false;
  return !alerts.some(
    (alert) =>
      alert === "expire_avant_retour" ||
      alert === "ancien_passeport" ||
      alert === "passeport_expire_avant_eta" ||
      alert === "passeport_expire_avant_retour"
  );
}

const BADGE: Record<UkEtaStatus, string> = {
  a_verifier: "À vérifier",
  approuve: "Valable",
  introuvable: "Introuvable",
  refuse: "Refusé",
  en_attente: "En attente",
  non_concerne: "Non concerné",
  erreur: "Erreur",
};

export function ukEtaBadge(input: { status: UkEtaStatus; validUntil?: string | null; alerts: UkEtaAlert[] }) {
  if (input.status === "non_concerne") return { label: BADGE.non_concerne, tone: "muted" as const };
  if (input.alerts.includes("ancien_passeport")) return { label: "Liée à un ancien passeport", tone: "warn" as const };
  if (input.status === "approuve" && input.alerts.includes("expire_avant_retour")) {
    return { label: "Expire avant le retour", tone: "warn" as const };
  }
  if (input.status === "approuve") {
    const date = formatEstaDate(input.validUntil);
    return { label: date ? `Valable jusqu’au ${date}` : "Valable", tone: "ok" as const };
  }
  const tone =
    input.status === "a_verifier" || input.status === "refuse" || input.status === "introuvable" || input.status === "erreur"
      ? ("warn" as const)
      : ("muted" as const);
  return { label: BADGE[input.status], tone };
}

export function ukEtaPassportCaption(alerts: UkEtaAlert[], passportExpires?: string | null) {
  const date = formatEstaDate(passportExpires);
  if (alerts.includes("passeport_expire_avant_retour")) {
    return date ? `Passeport expire le ${date}, avant le retour` : "Passeport expire avant le retour";
  }
  if (alerts.includes("passeport_expire_avant_eta")) {
    return date ? `Passeport expire le ${date}, avant la fin de l’ETA` : "Passeport expire avant la fin de l’ETA";
  }
  return null;
}

export function ukEtaNoteCaption(note: string | null | undefined, passportNumbers: string[] = []) {
  const clean = maskPassportInText(String(note || "").replace(/\s+/g, " ").trim(), passportNumbers);
  if (!clean || clean.length > 80) return null;
  if (/\d{6,}/.test(clean.replace(/\s/g, ""))) return null;
  return clean;
}

function validCaption(status: UkEtaStatus, validUntil: string | null | undefined, badge: string) {
  const date = formatEstaDate(validUntil);
  if (!date || badge.includes(date)) return null;
  if (status !== "approuve" && status !== "en_attente") return null;
  return `Fin de validité ${date}`;
}

const APPLY =
  `L’ETA Royaume-Uni est obligatoire pour ce séjour. Elle coûte 20 £ par personne, enfants compris. La demande se fait uniquement sur ${UK_ETA_APPLY_URL} ou dans l’application UK ETA. La décision arrive en général dans la journée, et au plus tard sous 3 jours ouvrés. Elle est valable 2 ans, ou jusqu’à l’expiration du passeport si elle arrive avant, et elle est liée au passeport.`;

export function ukEtaClientDraft(input: {
  status: UkEtaStatus;
  validUntil?: string | null;
  alerts: UkEtaAlert[];
  reference?: string | null;
  passportExpires?: string | null;
}) {
  if (input.status === "non_concerne" || input.status === "erreur" || input.status === "a_verifier") return null;
  const date = formatEstaDate(input.validUntil);
  let body: string | null = null;
  if (input.alerts.includes("ancien_passeport")) {
    body = `Votre ETA est liée à un ancien passeport. Elle ne suit pas le passeport actuel. ${APPLY}`;
  } else if (input.status === "refuse") {
    body = `Votre demande d’ETA Royaume-Uni a été refusée. L’agence revient vers vous. Le site officiel est ${UK_ETA_APPLY_URL}.`;
  } else if (input.status === "approuve" && input.alerts.includes("expire_avant_retour") && date) {
    body = `Votre ETA est valable jusqu’au ${date}, avant la fin du séjour. Il faut en demander une nouvelle. ${APPLY}`;
  } else if (input.status === "approuve" && date) {
    body = `Votre ETA Royaume-Uni est valable jusqu’au ${date}. Elle est liée au passeport présenté.`;
  } else if (input.status === "introuvable") {
    body = `Aucune ETA en cours n’a été trouvée pour ce passeport. ${APPLY}`;
  } else if (input.status === "en_attente") {
    body = "Votre ETA est en cours d’examen. La décision arrive en général dans la journée, et au plus tard sous 3 jours ouvrés.";
  }
  if (!body) return null;
  if (input.alerts.includes("passeport_expire_avant_retour")) {
    const expires = formatEstaDate(input.passportExpires);
    body += expires ? ` Votre passeport expire le ${expires}, avant le retour.` : " Votre passeport expire avant le retour.";
  } else if (input.alerts.includes("passeport_expire_avant_eta")) {
    const expires = formatEstaDate(input.passportExpires);
    body += expires
      ? ` Votre passeport expire le ${expires}, avant la fin de validité de l’ETA.`
      : " Votre passeport expire avant la fin de validité de l’ETA.";
  }
  const reference = (input.reference || "").trim() || "votre séjour";
  return {
    subject: `Votre ETA Royaume-Uni — ${reference}`,
    text: `Bonjour,\n\n${body}\n\nL’agence`,
  };
}

export function ukEtaAgencyDraft(input: {
  reference: string;
  travelerName: string;
  status: UkEtaStatus;
  validUntil?: string | null;
  alerts: UkEtaAlert[];
  href: string;
  note?: string | null;
  passportNumbers?: string[];
}) {
  const numbers = input.passportNumbers || [];
  const name = input.travelerName.trim() || "Un voyageur";
  const reference = input.reference.trim() || "Dossier";
  const covers = ukEtaCoversTrip(input.status, input.alerts);
  const date = formatEstaDate(input.validUntil);
  const lines = [`${name}`, `Dossier ${reference}`, BADGE[input.status]];
  if (date && input.status === "approuve") lines.push(`Valable jusqu’au ${date}`);
  if (input.status === "introuvable") {
    lines.push("ETA introuvable. Cela peut venir de données inexactes, d’une ETA expirée ou d’un changement de passeport.");
  }
  if (input.status === "refuse") lines.push("ETA refusée.");
  if (input.alerts.includes("expire_avant_retour")) lines.push("L’ETA expire avant le retour.");
  if (input.alerts.includes("ancien_passeport")) lines.push("L’ETA est liée à un ancien passeport.");
  if (input.alerts.includes("passeport_expire_avant_eta")) lines.push("Le passeport expire avant la fin de l’ETA.");
  if (input.alerts.includes("passeport_expire_avant_retour")) lines.push("Le passeport expire avant le retour.");
  const note = ukEtaNoteCaption(input.note, numbers);
  if (note) lines.push(note);
  const subject = covers
    ? `ETA Royaume-Uni · ${reference} · ${name} · valable${date ? ` jusqu’au ${date}` : ""}`
    : `ETA Royaume-Uni · ${reference} · ${name} · à traiter`;
  const intro = covers
    ? `L’ETA Royaume-Uni de ${name} est valable${date ? ` jusqu’au ${date}` : ""} et couvre le séjour.`
    : `L’ETA Royaume-Uni de ${name} n’est pas approuvée pour tout le séjour.`;
  return {
    kind: covers ? ("valable" as const) : ("alerte" as const),
    subject: maskPassportInText(subject, numbers),
    text: maskPassportInText([intro, ...lines, input.href].join("\n"), numbers),
    intro: maskPassportInText(intro, numbers),
  };
}

export type UkEtaWebhookBody = {
  id: string;
  booking_id: string;
  traveler_id: string;
  departure_date: string | null;
};

/** Identifiants seuls. Jamais le passeport, la MRZ ou la date de naissance. */
export function ukEtaWebhookBody(input: {
  id: string;
  bookingId: string;
  travelerId: string;
  departureDate?: string | null;
}): UkEtaWebhookBody {
  return {
    id: input.id,
    booking_id: input.bookingId,
    traveler_id: input.travelerId,
    departure_date: isoDay(input.departureDate),
  };
}

export function ukEtaWebhookHeader(key: string, headerName?: string | null) {
  const name = (headerName || "").trim() || "Authorization";
  const value = name.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
  return { name, value };
}

export function ukEtaWebhookConfigured(url?: string | null, key?: string | null) {
  return Boolean((url || "").trim() && (key || "").trim());
}

export function ukEtaClientAutoSend(value?: string | null) {
  const flag = (value || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "oui";
}

export function ukEtaDispatchDue(input: {
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
  return input.nowMs - attempt >= UK_ETA_DISPATCH_GAP_MS;
}

export type UkEtaStored = {
  status: UkEtaStatus;
  documentId: string | null;
  dispatchKey: string | null;
};

export type UkEtaPlan = {
  status: UkEtaStatus;
  documentId: string | null;
  dispatchKey: string | null;
  clearResult: boolean;
};

/**
 * Une ligne par voyageur. `null` : ne rien écrire (résultat déjà bon, ou pas de passeport).
 * Britannique ou irlandais : `non_concerne`. Les autres nationalités, même absente, sont à vérifier.
 */
export function planUkEtaCheck(input: {
  tripNeedsUkEta: boolean;
  passport: { id: string; nationality: string | null; issuingCountry?: string | null } | null;
  previous: UkEtaStored | null;
  manualStamp?: string | null;
}): UkEtaPlan | null {
  const manualKey = input.manualStamp ? `manual:${input.manualStamp}` : null;
  if (!input.tripNeedsUkEta) {
    if (!input.previous || input.previous.status !== "a_verifier") return null;
    return {
      status: "non_concerne",
      documentId: input.previous.documentId,
      dispatchKey: null,
      clearResult: false,
    };
  }
  if (!input.passport) return null;
  if (ukEtaExempt(input.passport.nationality, input.passport.issuingCountry)) {
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

export function ukEtaOnDailyList(input: {
  departure: string | null;
  today: string;
  status: UkEtaStatus;
  checkedAt?: string | null;
  validUntil?: string | null;
  returnOn?: string | null;
  passportNumber?: string | null;
  passportLast3?: string | null;
  nowMs: number;
}) {
  const departure = isoDay(input.departure);
  const today = isoDay(input.today);
  if (!departure || !today) return false;
  if (input.status === "non_concerne") return false;
  if (departure < today || departure > addIsoDays(today, UK_ETA_DAILY_HORIZON_DAYS)) return false;
  if (!input.checkedAt) return true;
  const alerts = ukEtaAlerts({
    status: input.status,
    validUntil: input.validUntil,
    returnOn: input.returnOn,
    passportNumber: input.passportNumber,
    passportLast3: input.passportLast3,
  });
  if (alerts.includes("expire_avant_retour") || alerts.includes("ancien_passeport")) return true;
  if (input.status === "approuve") return false;
  const checked = Date.parse(input.checkedAt);
  if (!Number.isFinite(checked)) return true;
  return input.nowMs - checked > UK_ETA_RECHECK_MS;
}

export function ukEtaTravelerLine(input: {
  traveler: CrmBookingTraveler;
  status: UkEtaStatus;
  validUntil?: string | null;
  checkedAt?: string | null;
  note?: string | null;
  returnOn?: string | null;
  passport: CrmTravelDocument | null;
  passportLast3?: string | null;
  clientSentAt?: string | null;
  requestedAt?: string | null;
  nowMs?: number;
}): UkEtaTravelerLine {
  const alerts = ukEtaAlerts({
    status: input.status,
    validUntil: input.validUntil,
    returnOn: input.returnOn,
    passportExpires: input.passport?.expires_on,
    passportNumber: input.passport?.number,
    passportLast3: input.passportLast3,
  });
  const badge = ukEtaBadge({ status: input.status, validUntil: input.validUntil, alerts });
  const caption =
    [
      ukEtaPassportCaption(alerts, input.passport?.expires_on),
      ukEtaNoteCaption(input.note, input.passport?.number ? [input.passport.number] : []),
      validCaption(input.status, input.validUntil, badge.label),
    ]
      .filter(Boolean)
      .join(" · ") || null;
  const draft = ukEtaClientDraft({
    status: input.status,
    validUntil: input.validUntil,
    alerts,
    passportExpires: input.passport?.expires_on,
  });
  const requestedAt = input.status === "a_verifier" ? input.requestedAt || null : null;
  const feedback = ukEtaFeedback({
    status: input.status,
    checkedAt: input.checkedAt,
    requestedAt,
    nowMs: input.nowMs ?? Date.now(),
  });
  return {
    travelerId: input.traveler.id,
    name: [input.traveler.first_name, input.traveler.last_name].filter(Boolean).join(" ").trim() || "Voyageur",
    badge: badge.label,
    tone: badge.tone,
    checkedLabel: feedback.label,
    caption,
    canVerify: input.status !== "non_concerne",
    canSend: Boolean(draft) && !input.clientSentAt,
    sent: Boolean(input.clientSentAt),
    status: input.status,
    checkedAt: input.checkedAt || null,
    requestedAt,
    validUntil: isoDay(input.validUntil),
  };
}

export function touchingUkItems(items: Pick<CrmBookingItem, "kind" | "lifecycle" | "title" | "details">[]) {
  return items.filter((item) => itemMentionsUk(item));
}
