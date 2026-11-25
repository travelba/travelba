import { pieceEstRetiree } from "@/lib/crm/dossier-piece";
import { isActiveItem } from "@/lib/crm/types";

/**
 * Un e-ticket couvre souvent plusieurs cartes vol du même dossier.
 * On l’affiche sur chacune, sans recopier le fichier.
 * Une carte d’embarquement, une facture ou un voucher d’hôtel reste sur sa carte.
 */

export type TicketFlightRef = {
  id: string;
  kind?: string | null;
  lifecycle?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  source_document_id?: string | null;
  details?: Record<string, unknown> | null;
};

export type TicketDocumentRef = {
  id: string;
  booking_item_id?: string | null;
  kind?: string | null;
  file_name?: string | null;
  content_sha256?: string | null;
  storage_path?: string | null;
  extracted?: unknown;
};

export type BilletSegment = {
  vol?: string;
  de?: string;
  vers?: string;
  jour?: string;
};

export type BilletCoverage = {
  pnrs: string[];
  billets: string[];
  segments: BilletSegment[];
};

const PNR_TOKEN = /^[A-Z0-9]{5,8}$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fold(value: string) {
  return value.trim().toUpperCase();
}

function fileKey(value: string) {
  return value.trim().toLowerCase();
}

function dayOf(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

export function compactFlightNumber(value: string) {
  return fold(value).replace(/[^A-Z0-9]/g, "");
}

function tokensFrom(raw: string) {
  const out = new Set<string>();
  for (const part of raw.split(/[^A-Za-z0-9]+/)) {
    const token = fold(part);
    if (PNR_TOKEN.test(token)) out.add(token);
  }
  return out;
}

/** Références de réservation imprimées sur la carte (PNR GDS ou compagnie). */
export function flightReservationTokens(flight: TicketFlightRef) {
  return tokensFrom(`${flight.confirmation_ref || ""} ${text(flight.details?.pnr)}`);
}

function digitRun(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 13 ? digits : "";
}

function pushTicket(out: Set<string>, value: unknown) {
  const ticket = digitRun(text(value));
  if (ticket) out.add(ticket);
}

/** Numéros de billet électronique (13 chiffres) portés par la carte. */
export function flightTicketNumbers(flight: TicketFlightRef) {
  const out = new Set<string>();
  const details = flight.details || {};
  pushTicket(out, details.ticket_number);
  if (Array.isArray(details.ticket_numbers)) {
    for (const value of details.ticket_numbers) pushTicket(out, value);
  }
  if (Array.isArray(details.passengers)) {
    for (const row of details.passengers) {
      if (!row || typeof row !== "object") continue;
      pushTicket(out, (row as { ticket_number?: unknown }).ticket_number);
    }
  }
  return out;
}

export function flightsShareReservation(left: TicketFlightRef, right: TicketFlightRef) {
  const rightTokens = flightReservationTokens(right);
  for (const token of flightReservationTokens(left)) {
    if (rightTokens.has(token)) return true;
  }
  const rightTickets = flightTicketNumbers(right);
  for (const ticket of flightTicketNumbers(left)) {
    if (rightTickets.has(ticket)) return true;
  }
  return false;
}

function isBoardingDocument(doc: TicketDocumentRef) {
  const kind = (doc.kind || "").replace(/’/g, "'").toLowerCase();
  if (kind === "carte d'embarquement") return true;
  return (doc.file_name || "").toLowerCase().endsWith(".pkpass");
}

function isInvoiceDocument(doc: TicketDocumentRef) {
  const kind = (doc.kind || "").toLowerCase();
  if (kind === "invoice" || kind === "facture" || kind === "proforma") return true;
  return /\b(facture|invoice|proforma)\b/i.test(doc.file_name || "");
}

function listedFileNames(flight: TicketFlightRef) {
  const names: string[] = [];
  const one = text(flight.details?.source_file_name);
  if (one) names.push(one);
  const many = flight.details?.source_files;
  if (Array.isArray(many)) {
    for (const name of many) {
      const value = text(name);
      if (value) names.push(value);
    }
  }
  return names;
}

function namedOnFlight(doc: TicketDocumentRef, flight: TicketFlightRef) {
  const file = fileKey(doc.file_name || "");
  if (!file) return false;
  return listedFileNames(flight).some((name) => fileKey(name) === file);
}

export function readBilletCoverage(extracted: unknown): BilletCoverage | null {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return null;
  const raw = (extracted as { billet?: unknown }).billet;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as { pnrs?: unknown; billets?: unknown; segments?: unknown };
  const pnrs = Array.isArray(row.pnrs) ? row.pnrs.map((value) => fold(text(value))).filter((value) => PNR_TOKEN.test(value)) : [];
  const billets = Array.isArray(row.billets) ? row.billets.map((value) => digitRun(text(value))).filter(Boolean) : [];
  const segments: BilletSegment[] = [];
  if (Array.isArray(row.segments)) {
    for (const value of row.segments) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const segment = value as { vol?: unknown; de?: unknown; vers?: unknown; jour?: unknown };
      const vol = text(segment.vol);
      const de = fold(text(segment.de));
      const vers = fold(text(segment.vers));
      const jour = dayOf(text(segment.jour));
      if (!vol && !(de && vers)) continue;
      segments.push({ vol, de, vers, jour });
    }
  }
  if (!pnrs.length && !billets.length && !segments.length) return null;
  return { pnrs, billets, segments };
}

function segmentMatches(segment: BilletSegment, flight: TicketFlightRef) {
  const flightNumber = compactFlightNumber(text(flight.details?.flight_number));
  const segmentNumber = compactFlightNumber(segment.vol || "");
  const numberHit = Boolean(flightNumber && segmentNumber && flightNumber === segmentNumber);
  const from = fold(text(flight.details?.from));
  const to = fold(text(flight.details?.to));
  const routeHit = Boolean(segment.de && segment.vers && from && to && segment.de === from && segment.vers === to);
  if (!numberHit && !routeHit) return false;
  const flightDay = dayOf(text(flight.start_at));
  if (segment.jour && flightDay && segment.jour !== flightDay) return false;
  return true;
}

function billetCovers(doc: TicketDocumentRef, flight: TicketFlightRef) {
  const coverage = readBilletCoverage(doc.extracted);
  if (!coverage) return false;
  const tokens = flightReservationTokens(flight);
  if (coverage.pnrs.some((pnr) => tokens.has(pnr))) return true;
  const tickets = flightTicketNumbers(flight);
  if (coverage.billets.some((ticket) => tickets.has(ticket))) return true;
  return coverage.segments.some((segment) => segmentMatches(segment, flight));
}

export function directlyOnFlight(doc: TicketDocumentRef, flight: TicketFlightRef) {
  if (!doc.id || !flight.id) return false;
  return doc.booking_item_id === flight.id || flight.source_document_id === doc.id;
}

/**
 * Le document s’affiche sur cette carte vol en plus de son rattachement direct.
 * Même réservation (PNR ou n° de billet), fichier cité par la carte, ou segments lus.
 */
export function coversSharedFlight(doc: TicketDocumentRef, flight: TicketFlightRef, dossier: TicketFlightRef[]) {
  if (!flight.id || flight.kind !== "flight" || !isActiveItem(flight)) return false;
  if (!doc.id || pieceEstRetiree(doc.extracted)) return false;
  if (isBoardingDocument(doc) || isInvoiceDocument(doc)) return false;
  if (namedOnFlight(doc, flight)) return true;
  if (billetCovers(doc, flight)) return true;
  for (const other of dossier) {
    if (!other.id || other.id === flight.id || other.kind !== "flight") continue;
    if (other.lifecycle === "superseded") continue;
    if (!directlyOnFlight(doc, other)) continue;
    if (flightsShareReservation(flight, other)) return true;
  }
  return false;
}

/** Cartes vol sur lesquelles cette pièce doit apparaître, rattachement direct compris. */
export function flightsCoveredByDocument(doc: TicketDocumentRef, dossier: TicketFlightRef[]) {
  const ids = new Set<string>();
  for (const flight of dossier) {
    if (flight.kind !== "flight" || !flight.id) continue;
    if (directlyOnFlight(doc, flight) || coversSharedFlight(doc, flight, dossier)) ids.add(flight.id);
  }
  return ids;
}

function copyKey(doc: TicketDocumentRef) {
  const sha = (doc.content_sha256 || "").trim().toLowerCase();
  if (sha) return `sha:${sha}`;
  const path = (doc.storage_path || "").trim();
  if (path) return `path:${path}`;
  return `id:${doc.id}`;
}

/** Une seule vignette quand le même fichier a été copié sur plusieurs cartes. */
export function dedupeSharedTickets<T extends TicketDocumentRef>(docs: T[], preferredItemIds: string[]) {
  const preferred = new Set(preferredItemIds);
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const doc of docs) {
    const key = copyKey(doc);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)?.push(doc);
  }
  return order.map((key) => {
    const rows = groups.get(key) || [];
    return rows.find((row) => row.booking_item_id && preferred.has(row.booking_item_id)) || rows[0];
  });
}

export function billetStamp(read: {
  pnr?: string | null;
  ticketNumber?: string | null;
  segments?: { flightNumber?: string | null; from?: string | null; to?: string | null; departureAt?: string | null }[];
}): { billet: BilletCoverage } | null {
  const pnrs = read.pnr && PNR_TOKEN.test(fold(read.pnr)) ? [fold(read.pnr)] : [];
  const ticket = read.ticketNumber ? digitRun(read.ticketNumber) : "";
  const billets = ticket ? [ticket] : [];
  const segments: BilletSegment[] = [];
  for (const segment of read.segments || []) {
    const vol = text(segment.flightNumber);
    const de = fold(text(segment.from));
    const vers = fold(text(segment.to));
    const jour = dayOf(text(segment.departureAt));
    if (!vol && !(de && vers)) continue;
    segments.push({ vol, de, vers, jour });
  }
  if (!pnrs.length && !billets.length && !segments.length) return null;
  return { billet: { pnrs, billets, segments } };
}

/** Pose la couverture lue sans effacer le reste de `extracted` (passe, retrait). */
export function mergeBilletExtract(existing: unknown, stamp: { billet: BilletCoverage } | null) {
  if (!stamp) return null;
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, billet: stamp.billet };
}
