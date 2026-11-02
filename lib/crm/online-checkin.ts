import { inferAirlineIata } from "./brand-marks";
import { flightCities, flightIata, flightNumber } from "./carnet";
import { knownCheckinLeadHours, readFlightWatch } from "./flight-watch";
import { isActiveItem, type CrmBookingDocument, type CrmBookingItem } from "./types";

/** 24 h avant le départ quand la compagnie n’a pas de fenêtre publiée. */
export const ONLINE_CHECKIN_DEFAULT_LEAD_HOURS = 24;

export const ONLINE_CHECKIN_STATUSES = [
  "a_faire",
  "ouvert",
  "en_cours",
  "fait",
  "cartes_recues",
  "envoyees",
] as const;

export type OnlineCheckinStatus = (typeof ONLINE_CHECKIN_STATUSES)[number];

export type OnlineCheckinActor = "agence" | "bot";

const RANK: Record<OnlineCheckinStatus, number> = {
  a_faire: 0,
  ouvert: 1,
  en_cours: 2,
  fait: 3,
  cartes_recues: 4,
  envoyees: 5,
};

export const ONLINE_CHECKIN_LABELS: Record<OnlineCheckinStatus, string> = {
  a_faire: "Enregistrement à faire",
  ouvert: "Enregistrement ouvert",
  en_cours: "Enregistrement en cours",
  fait: "Enregistrement fait",
  cartes_recues: "Cartes d’embarquement reçues",
  envoyees: "Envoyées au client",
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const STATUS_ALIASES: Record<string, OnlineCheckinStatus> = {
  a_faire: "a_faire",
  afaire: "a_faire",
  "a faire": "a_faire",
  "à faire": "a_faire",
  ouvert: "ouvert",
  ouverte: "ouvert",
  en_cours: "en_cours",
  encours: "en_cours",
  "en cours": "en_cours",
  fait: "fait",
  faite: "fait",
  cartes_recues: "cartes_recues",
  cartesrecues: "cartes_recues",
  "cartes recues": "cartes_recues",
  "cartes reçues": "cartes_recues",
  "cartes d'embarquement recues": "cartes_recues",
  "cartes d'embarquement reçues": "cartes_recues",
  envoyees: "envoyees",
  envoyee: "envoyees",
  envoyées: "envoyees",
  "envoyees au client": "envoyees",
  "envoyées au client": "envoyees",
};

export type StoredFlightCheckin = {
  booking_item_id: string;
  status: string | null;
  actor: string | null;
};

export type FlightCheckinView = {
  itemId: string;
  route: string;
  flight: string;
  status: OnlineCheckinStatus;
  label: string;
  opensAt: string | null;
  openingLabel: string;
  leadHours: number | null;
  actor: OnlineCheckinActor | null;
  actorLabel: string;
  alert: boolean;
  done: boolean;
  cancelled: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOnlineCheckinStatus(value: unknown): OnlineCheckinStatus | null {
  const key = fold(text(value)).replace(/ /g, "_");
  const spaced = fold(text(value));
  return STATUS_ALIASES[key] || STATUS_ALIASES[spaced] || null;
}

export function parseOnlineCheckinActor(value: unknown): OnlineCheckinActor | null {
  if (value === "agence" || value === "bot") return value;
  return null;
}

export function checkinActorLabel(actor: OnlineCheckinActor | null) {
  if (actor === "bot") return "Enregistrement en ligne";
  if (actor === "agence") return "Agence";
  return "";
}

export function onlineCheckinRank(status: OnlineCheckinStatus) {
  return RANK[status];
}

export function checkinAirlineCode(item: { supplier?: string | null; details?: Record<string, unknown> | null }) {
  const details = item.details || {};
  return inferAirlineIata({
    airline_iata: text(details.airline_iata),
    flight_number: text(details.flight_number),
    airline: text(details.airline) || text(item.supplier),
  });
}

/** Fenêtre publiée de la compagnie, sinon 24 h. Null s’il n’y a pas d’heure de départ. */
export function onlineCheckinLeadHours(item: { supplier?: string | null; details?: Record<string, unknown> | null }) {
  return knownCheckinLeadHours(checkinAirlineCode(item)) ?? ONLINE_CHECKIN_DEFAULT_LEAD_HOURS;
}

export function onlineCheckinOpensAt(
  item: { supplier?: string | null; details?: Record<string, unknown> | null; start_at?: string | null }
) {
  const start = item.start_at ? Date.parse(item.start_at) : Number.NaN;
  if (!Number.isFinite(start)) return null;
  const lead = onlineCheckinLeadHours(item);
  return new Date(start - lead * 60 * 60 * 1000);
}

export function formatCheckinOpening(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const day = Number(get("day"));
  const month = MONTHS[Number(get("month")) - 1] || "";
  const hour = get("hour");
  const minute = get("minute");
  if (!day || !month || !hour || !minute) return "";
  return `Ouverture le ${day} ${month} à ${hour}h${minute}`;
}

export function isBoardingPassDocument(doc: { kind?: string | null }) {
  const kind = (doc.kind || "").replace(/’/g, "'");
  return kind === "carte d'embarquement";
}

function compactFlight(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function passMatchesFlight(
  doc: { id?: string | null; booking_item_id?: string | null; file_name?: string | null },
  flight: { id: string; source_document_id?: string | null; details?: Record<string, unknown> | null; title?: string | null }
) {
  if (doc.booking_item_id && doc.booking_item_id === flight.id) return true;
  if (doc.id && flight.source_document_id && doc.id === flight.source_document_id) return true;
  const number = compactFlight(flightNumber(flight as CrmBookingItem));
  if (number.length < 4) return false;
  const hay = compactFlight(`${doc.file_name || ""}`);
  return hay.includes(number);
}

function flightRoute(item: CrmBookingItem) {
  return flightCities(item) || flightIata(item) || (item.title || "").trim() || "Vol";
}

export type CheckinFlight = Pick<
  CrmBookingItem,
  "id" | "kind" | "title" | "supplier" | "start_at" | "details" | "lifecycle" | "source_document_id"
>;

function activeFlights(items: CheckinFlight[]) {
  return items.filter(
    (item) => item.kind === "flight" && isActiveItem(item) && !item.id.startsWith("draft:")
  );
}

function storedFor(rows: StoredFlightCheckin[], itemId: string) {
  const row = rows.find((entry) => entry.booking_item_id === itemId);
  return {
    status: parseOnlineCheckinStatus(row?.status),
    actor: parseOnlineCheckinActor(row?.actor),
  };
}

function flightHasPass(flight: CheckinFlight, passes: { id?: string | null; booking_item_id?: string | null; file_name?: string | null }[], onlyFlight: boolean) {
  if (!passes.length) return false;
  if (passes.some((doc) => passMatchesFlight(doc, flight))) return true;
  return onlyFlight;
}

/**
 * Statut affiché. Une carte d’embarquement déjà au dossier monte à « cartes reçues ».
 * Un envoi déjà noté reste « envoyées ». On ne redescend pas.
 */
export function displayCheckinStatus(input: {
  stored: OnlineCheckinStatus | null;
  opensAt: Date | null;
  now: Date;
  boardingPass: boolean;
  sent: boolean;
  cancelled: boolean;
}): OnlineCheckinStatus {
  let status: OnlineCheckinStatus = input.stored || "a_faire";
  const windowOpen = Boolean(input.opensAt && input.opensAt.getTime() <= input.now.getTime());
  if (!input.cancelled && status === "a_faire" && windowOpen) status = "ouvert";
  if (input.boardingPass && RANK[status] < RANK.cartes_recues) status = "cartes_recues";
  if ((input.sent || input.stored === "envoyees") && RANK[status] < RANK.envoyees) status = "envoyees";
  return status;
}

export function flightCheckinViews(input: {
  items: CheckinFlight[];
  documents: Pick<CrmBookingDocument, "id" | "kind" | "file_name" | "booking_item_id">[];
  rows: StoredFlightCheckin[];
  now: Date;
}): FlightCheckinView[] {
  const flights = activeFlights(input.items);
  const passes = input.documents.filter(isBoardingPassDocument);
  const onlyFlight = flights.length === 1;
  return flights
    .slice()
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""))
    .map((flight) => {
      const stored = storedFor(input.rows, flight.id);
      const opens = onlineCheckinOpensAt(flight);
      const cancelled = readFlightWatch(flight.details).status === "cancelled";
      const boardingPass = flightHasPass(flight, passes, onlyFlight);
      const sent = stored.status === "envoyees";
      const status = displayCheckinStatus({
        stored: stored.status,
        opensAt: opens,
        now: input.now,
        boardingPass,
        sent,
        cancelled,
      });
      const done = RANK[status] >= RANK.fait;
      const windowOpen = Boolean(opens && opens.getTime() <= input.now.getTime());
      const alert = !cancelled && !done && (status === "ouvert" || windowOpen);
      const lead = opens ? onlineCheckinLeadHours(flight) : null;
      const opening = formatCheckinOpening(opens);
      return {
        itemId: flight.id,
        route: flightRoute(flight as CrmBookingItem),
        flight: flightNumber(flight as CrmBookingItem),
        status,
        label: ONLINE_CHECKIN_LABELS[status],
        opensAt: opens ? opens.toISOString() : null,
        openingLabel: opening && lead ? `${opening} · ${lead} h avant` : opening,
        leadHours: lead,
        actor: done ? stored.actor : stored.actor,
        actorLabel: checkinActorLabel(stored.actor),
        alert,
        done,
        cancelled,
      };
    });
}

export function dossierCheckinBadge(lines: FlightCheckinView[]) {
  if (!lines.length) return null;
  const alerts = lines.filter((line) => line.alert).length;
  if (alerts > 0) {
    return {
      label: alerts > 1 ? `${alerts} enregistrements ouverts` : "Enregistrement ouvert",
      alert: true,
      done: false,
    };
  }
  if (lines.some((line) => line.status === "en_cours")) {
    return { label: "Enregistrement en cours", alert: false, done: false };
  }
  if (lines.some((line) => !line.done && !line.cancelled)) {
    return { label: "Enregistrement à faire", alert: false, done: false };
  }
  if (lines.every((line) => line.status === "envoyees" || line.cancelled)) {
    return { label: "Envoyées au client", alert: false, done: true };
  }
  if (lines.some((line) => line.status === "cartes_recues")) {
    return { label: "Cartes d’embarquement reçues", alert: false, done: true };
  }
  return { label: "Enregistrement fait", alert: false, done: true };
}

export type CheckinWrite = {
  booking_item_id: string;
  booking_id: string;
  status: OnlineCheckinStatus;
  actor: OnlineCheckinActor;
};

function shouldKeep(stored: OnlineCheckinStatus | null, next: OnlineCheckinStatus) {
  if (!stored) return false;
  return RANK[stored] >= RANK[next];
}

/** Cartes d’embarquement déjà au dossier : le vol passe à « cartes reçues », sans redescendre. */
export function checkinPassWrites(input: {
  bookingId: string;
  items: CheckinFlight[];
  documents: Pick<CrmBookingDocument, "id" | "kind" | "file_name" | "booking_item_id">[];
  rows: StoredFlightCheckin[];
  actor: OnlineCheckinActor;
  now: Date;
}): CheckinWrite[] {
  const views = flightCheckinViews(input);
  const writes: CheckinWrite[] = [];
  for (const view of views) {
    if (view.status !== "cartes_recues" && view.status !== "envoyees") continue;
    const stored = storedFor(input.rows, view.itemId).status;
    const next: OnlineCheckinStatus = view.status === "envoyees" ? "envoyees" : "cartes_recues";
    if (shouldKeep(stored, next)) continue;
    if (next === "envoyees") continue;
    writes.push({
      booking_item_id: view.itemId,
      booking_id: input.bookingId,
      status: "cartes_recues",
      actor: input.actor,
    });
  }
  return writes;
}

/** Envoi WhatsApp confirmé : « envoyées au client » sur les vols reconnus. */
export function checkinSentWrites(input: {
  bookingId: string;
  items: CheckinFlight[];
  documents: Pick<CrmBookingDocument, "id" | "kind" | "file_name" | "booking_item_id">[];
  rows: StoredFlightCheckin[];
  actor: OnlineCheckinActor;
  documentIds: string[];
  flightLabels: string[];
}): CheckinWrite[] {
  const flights = activeFlights(input.items);
  const passes = input.documents.filter(isBoardingPassDocument);
  const ids = new Set(input.documentIds.filter(Boolean));
  const labels = input.flightLabels.map(compactFlight).filter((label) => label.length >= 4);
  const matched = flights.filter((flight) => {
    const byDoc = passes.some((doc) => ids.has(doc.id || "") && passMatchesFlight(doc, flight));
    if (byDoc) return true;
    const number = compactFlight(flightNumber(flight as CrmBookingItem));
    if (number.length >= 4 && labels.some((label) => label.includes(number))) return true;
    return false;
  });
  const targets = matched.length ? matched : flights.length === 1 ? flights : [];
  const writes: CheckinWrite[] = [];
  for (const flight of targets) {
    const stored = storedFor(input.rows, flight.id).status;
    if (shouldKeep(stored, "envoyees")) continue;
    writes.push({
      booking_item_id: flight.id,
      booking_id: input.bookingId,
      status: "envoyees",
      actor: input.actor,
    });
  }
  return writes;
}

/** Écriture agence ou bot. Une carte déjà reçue ou envoyée ne redescend pas. */
export function checkinManualWrite(input: {
  bookingId: string;
  itemId: string;
  requested: OnlineCheckinStatus;
  stored: OnlineCheckinStatus | null;
  boardingPass: boolean;
  sent: boolean;
  actor: OnlineCheckinActor;
}): CheckinWrite {
  let status = input.requested;
  if (input.sent || input.stored === "envoyees") {
    if (RANK[status] < RANK.envoyees) status = "envoyees";
  } else if (input.boardingPass && RANK[status] < RANK.cartes_recues) {
    status = "cartes_recues";
  }
  return {
    booking_item_id: input.itemId,
    booking_id: input.bookingId,
    status,
    actor: input.actor,
  };
}

export function checkinMcpLine(view: FlightCheckinView) {
  return {
    carte_id: view.itemId,
    vol: view.flight || null,
    trajet: view.route,
    statut: view.status,
    libelle: view.label,
    ouverture: view.opensAt,
    ouverture_libelle: view.openingLabel || null,
    heures_avant: view.leadHours,
    par: view.actorLabel || null,
    alerte: view.alert,
    fait: view.done,
  };
}

const IDENTITY_KEYS = new Set([
  "mrz",
  "passeport",
  "passport",
  "numero",
  "numero_piece",
  "personal_number",
  "pan",
  "cvv",
  "cvc",
]);

/** Le bot ne peut pas glisser une pièce d’identité dans cet appel. */
export function checkinInputHasIdentity(input: Record<string, unknown>) {
  return Object.keys(input).some((key) => IDENTITY_KEYS.has(fold(key).replace(/ /g, "_")));
}
