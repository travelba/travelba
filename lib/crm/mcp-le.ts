import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { isIsoDate } from "@/lib/crm/admin-schemas";
import { confirmationRefsAlign, firstNamesAlign, lastNamesClose, referenceTokens } from "@/lib/crm/email-match";
import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";
import { hotelBookingStem, joinConfirmationRefs } from "@/lib/crm/item-match";
import {
  cancellationStatut,
  leCancellationVerdict,
  loadStayAnchors,
  type CancellationVerdict,
} from "@/lib/crm/cancellation-standing";
import {
  benefitsFromLeRaw,
  isLeCancelled,
  leDateOnly,
  listLittleEmperorsBookings,
  littleEmperorsConfigured,
  LittleEmperorsError,
  parseLeBooking,
  splitGuestName,
  type LeBooking,
  type LeRoom,
} from "@/lib/crm/little-emperors";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { parseMoney } from "@/lib/crm/money";
import { foldName } from "@/lib/crm/person-match";
import { createServiceClient } from "@/lib/supabase/admin";

type Admin = SupabaseClient;

export type LeLookup = {
  confirmation: string | null;
  nom: string | null;
  hotel: string | null;
  arrivee: string | null;
  depart: string | null;
};

type StoredLe = {
  le_booking_id: number | string;
  confirmation_number?: string | null;
  state?: string | null;
  hotel_id?: number | null;
  hotel_name?: string | null;
  city?: string | null;
  address?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  currency?: string | null;
  total_cost?: string | null;
  guest_names?: string[] | null;
  cancellation_policies?: string[] | null;
  room_types?: string[] | null;
  is_cancellable?: boolean | null;
  cancellation_deadline?: string | null;
  raw?: unknown;
  crm_booking_id?: string | null;
};

export type LeCandidate = {
  booking: LeBooking;
  crmBookingId: string | null;
  source: "api" | "enregistree";
};

export type LeDossierRef = {
  id: string;
  reference: string | null;
  titre: string | null;
};

function db(admin?: Admin) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function optionalText(value: unknown, label: string, max: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new McpReadError(`${label} invalide.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new McpReadError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function dayOf(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!isIsoDate(raw)) throw new McpReadError(`${label} invalide (AAAA-MM-JJ).`);
  return raw;
}

export function leLookup(input: Record<string, unknown>): LeLookup {
  const confirmation =
    optionalText(input.confirmation, "Référence", 80) || optionalText(input.reference, "Référence", 80);
  const nom = optionalText(input.nom, "Nom", 120);
  const hotel = optionalText(input.hotel, "Hôtel", 160);
  const arrivee = dayOf(input.arrivee, "Arrivée");
  const depart = dayOf(input.depart, "Départ");
  if (arrivee && depart && depart < arrivee) throw new McpReadError("La date de départ est avant l’arrivée.");
  if (!confirmation && !(nom && hotel)) {
    throw new McpReadError("Indiquez la référence, ou le nom du client et l’hôtel.");
  }
  return { confirmation, nom, hotel, arrivee, depart };
}

function cleanName(value: string) {
  return value.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

/** Nom du client : égalité, prénom, nom, ou distance d’édition ≤ 1. */
export function guestNameMatches(guest: string, query: string) {
  const left = cleanName(guest);
  const right = cleanName(query);
  if (!foldName(left) || !foldName(right)) return false;
  if (foldName(left) === foldName(right)) return true;
  const person = splitGuestName(left);
  const asked = splitGuestName(right);
  if (person && asked) {
    return lastNamesClose(person.last_name, asked.last_name) && firstNamesAlign(person.first_name, asked.first_name);
  }
  if (person) return lastNamesClose(person.last_name, right) || firstNamesAlign(person.first_name, right);
  return foldName(left).includes(foldName(right));
}

const HOTEL_STOP = new Set(["hotel", "the", "and", "resort", "spa", "collection", "by", "ihg"]);

function foldHotel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hotelTokens(value: string) {
  return foldHotel(value)
    .split(" ")
    .filter((token) => token.length > 3 && !HOTEL_STOP.has(token));
}

/** Nom d’hôtel : égalité, inclusion d’un nom assez long, ou mots significatifs (Milano = Milan). */
function hotelMatches(name: string | null, query: string) {
  const hotel = (name || "").trim();
  const asked = query.trim();
  if (!hotel || !asked) return false;
  const left = foldHotel(asked);
  const right = foldHotel(hotel);
  if (left === right) return true;
  const tokens = hotelTokens(asked);
  const known = hotelTokens(hotel);
  if (
    tokens.length &&
    tokens.every((token) => known.some((other) => other === token || other.includes(token) || token.includes(other)))
  ) {
    return true;
  }
  return Math.min(left.length, right.length) >= 8 && (right.includes(left) || left.includes(right));
}

function datesMatch(booking: LeBooking, query: LeLookup) {
  if (query.arrivee && leDateOnly(booking.check_in) !== query.arrivee) return false;
  if (query.depart && leDateOnly(booking.check_out) !== query.depart) return false;
  return true;
}

function confirmationMatch(booking: LeBooking, confirmation: string) {
  const refs = [
    booking.confirmation_number,
    ...(booking.hotel_confirmations || []),
    ...(booking.rooms || []).map((room) => room.hotel_confirmation),
  ];
  return refs.some((ref) => confirmationRefsAlign(ref, confirmation));
}

export function selectLeReservations(rows: LeCandidate[], query: LeLookup) {
  return rows.filter((row) => {
    const booking = row.booking;
    if (query.confirmation && !confirmationMatch(booking, query.confirmation)) return false;
    if (query.nom) {
      const guests = booking.guest_names || [];
      if (!guests.some((guest) => guestNameMatches(guest, query.nom || ""))) return false;
    }
    if (query.hotel && !hotelMatches(booking.hotel_name, query.hotel)) return false;
    return datesMatch(booking, query);
  });
}

function unique(values: (string | null | undefined)[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const line = (value || "").trim();
    const key = line.toLocaleLowerCase("fr");
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function leStatut(state: string | null | undefined) {
  const value = (state || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "cancelled" || value === "canceled") return "Annulée";
  if (value === "booked" || value === "confirmed") return "Réservée";
  return (state || "").trim();
}

function viewRooms(booking: LeBooking): LeRoom[] {
  if (booking.rooms?.length) return booking.rooms;
  const types = booking.room_types || [];
  const guests = booking.guest_names || [];
  const policies = booking.cancellation_policies || [];
  const confirmations = booking.hotel_confirmations || [];
  const count = Math.max(types.length, guests.length);
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => ({
    guest_name: guests.length === types.length || types.length === 0 ? guests[index] || null : null,
    room_type: types[index] || (types.length === 1 ? types[0] : null),
    board: booking.board || null,
    hotel_confirmation: confirmations.length === 1 ? confirmations[0] : confirmations[index] || null,
    cancellation_policy: policies[index] || (policies.length === 1 ? policies[0] : null),
  }));
}

function benefitsOf(booking: LeBooking) {
  return unique((booking.benefits || []).map((line) => frenchLeBenefitLine(line)));
}

function moneyOf(value: string | null | undefined) {
  return parseMoney(value);
}

export function presentLeReservation(
  booking: LeBooking,
  dossier: LeDossierRef | null,
  extra?: { dossiers?: LeDossierRef[]; source?: "api" | "enregistree" }
) {
  const rooms = viewRooms(booking);
  const regimes = unique([...rooms.map((room) => room.board), booking.board]);
  const confirmations = unique([
    ...(booking.hotel_confirmations || []),
    ...rooms.map((room) => room.hotel_confirmation),
  ]);
  const guests = unique([...(booking.guest_names || []), ...rooms.map((room) => room.guest_name)]);
  const prixNet = moneyOf(booking.total_cost);
  const prixPublic = moneyOf(booking.public_price);
  const dossiers = extra?.dossiers || [];
  return {
    reference: booking.confirmation_number,
    statut: leStatut(booking.state),
    hotel: booking.hotel_name,
    ville: booking.city,
    adresse: booking.address,
    arrivee: booking.check_in,
    depart: booking.check_out,
    chambres: rooms
      .map((room) => ({
        type: room.room_type,
        regime: room.board,
        voyageur: room.guest_name,
        confirmation: room.hotel_confirmation,
      }))
      .filter((room) => room.type || room.regime || room.voyageur || room.confirmation),
    regime: regimes.join(" · ") || null,
    voyageurs: guests,
    prix_net: prixNet,
    devise_net: prixNet != null ? booking.currency : null,
    prix_public: prixPublic,
    devise_public: prixPublic != null ? booking.public_currency || booking.currency : null,
    avantages: benefitsOf(booking),
    conditions_annulation: unique(booking.cancellation_policies),
    date_limite_annulation: booking.cancellation_deadline,
    confirmations_hotel: confirmations,
    dossier,
    ...(dossiers.length > 1 ? { dossiers } : {}),
    source: extra?.source || "enregistree",
  };
}

function joinRefs(refs: (string | null | undefined)[]) {
  return refs.reduce<string | null>((acc, ref) => joinConfirmationRefs(acc, ref), null);
}

/** Champs de carte lus sur la réservation. Le prix de vente n’en fait pas partie. */
export function leCardFill(booking: LeBooking) {
  const rooms = viewRooms(booking);
  const regimes = unique([...rooms.map((room) => room.board), booking.board]);
  const confirmations = unique([
    ...(booking.hotel_confirmations || []),
    ...rooms.map((room) => room.hotel_confirmation),
  ]);
  const guests = unique([...(booking.guest_names || []), ...rooms.map((room) => room.guest_name)]);
  return {
    nom: booking.hotel_name,
    ville: booking.city,
    adresse: booking.address,
    arrivee: booking.check_in,
    depart: booking.check_out,
    pension: regimes.join(" · ") || null,
    inclus: benefitsOf(booking),
    conditions: unique(booking.cancellation_policies),
    confirmation: joinRefs([booking.confirmation_number, ...confirmations]),
    confirmations,
    guests,
    leHotelId: booking.hotel_id,
    prixNet: moneyOf(booking.total_cost),
    deviseNet: booking.currency,
    rooms: rooms.map((room) => ({
      room: room.room_type,
      type: room.room_type,
      guests: room.guest_name,
      confirmation_ref: room.hotel_confirmation || booking.confirmation_number,
      ...(room.board ? { board: room.board } : {}),
    })),
  };
}

function bookingFromStored(row: StoredLe): LeBooking {
  const raw = record(row.raw) || {};
  const parsed = parseLeBooking({ ...raw, id: raw.id ?? row.le_booking_id });
  const guests = stringList(row.guest_names);
  const roomTypes = stringList(row.room_types);
  const policies = stringList(row.cancellation_policies);
  const rawBenefits = stringList(raw.benefits);
  return {
    id: Number(row.le_booking_id),
    hotel_id: row.hotel_id ?? parsed?.hotel_id ?? null,
    hotel_name: row.hotel_name || parsed?.hotel_name || null,
    city: row.city || parsed?.city || null,
    address: row.address || parsed?.address || null,
    website: parsed?.website || null,
    check_in: leDateOnly(row.check_in) || parsed?.check_in || null,
    check_out: leDateOnly(row.check_out) || parsed?.check_out || null,
    state: row.state || parsed?.state || null,
    confirmation_number: row.confirmation_number || parsed?.confirmation_number || null,
    total_cost: row.total_cost || parsed?.total_cost || null,
    currency: row.currency || parsed?.currency || null,
    public_price: parsed?.public_price ?? (typeof raw.public_price === "string" ? raw.public_price : null),
    public_currency: parsed?.public_currency ?? (typeof raw.public_currency === "string" ? raw.public_currency : null),
    board: parsed?.board ?? (typeof raw.board === "string" ? raw.board : null),
    hotel_confirmations: parsed?.hotel_confirmations?.length
      ? parsed.hotel_confirmations
      : stringList(raw.hotel_confirmations),
    is_cancellable: typeof row.is_cancellable === "boolean" ? row.is_cancellable : parsed?.is_cancellable ?? null,
    cancellation_deadline: row.cancellation_deadline || parsed?.cancellation_deadline || null,
    guest_names: guests.length ? guests : parsed?.guest_names || [],
    cancellation_policies: policies.length ? policies : parsed?.cancellation_policies || [],
    room_types: roomTypes.length ? roomTypes : parsed?.room_types || [],
    benefits: rawBenefits.length ? rawBenefits : benefitsFromLeRaw(raw).length ? benefitsFromLeRaw(raw) : parsed?.benefits || [],
    rooms: parsed?.rooms?.length ? parsed.rooms : undefined,
  };
}

function mergeReservations(stored: StoredLe[], live: LeBooking[] | null): LeCandidate[] {
  const byId = new Map<number, LeCandidate>();
  for (const row of stored) {
    const booking = bookingFromStored(row);
    if (!Number.isFinite(booking.id)) continue;
    byId.set(booking.id, {
      booking,
      crmBookingId: row.crm_booking_id || null,
      source: "enregistree",
    });
  }
  for (const booking of live || []) {
    const current = byId.get(booking.id);
    byId.set(booking.id, {
      booking,
      crmBookingId: current?.crmBookingId || null,
      source: "api",
    });
  }
  return [...byId.values()];
}

function ambiguity(rows: LeCandidate[]) {
  const lines = rows.slice(0, 5).map((row) => {
    const booking = row.booking;
    return [booking.confirmation_number, booking.hotel_name, booking.guest_names?.[0], booking.check_in]
      .filter(Boolean)
      .join(" · ");
  });
  throw new McpReadError(
    `Plusieurs réservations Little Emperors. Précisez la référence ou les dates. ${lines.join(" ; ")}`
  );
}

async function loadStored(admin: Admin) {
  const { data, error } = await admin.from("crm_le_bookings").select("*");
  if (error) {
    console.error("[mcp] little-emperors", error.code ?? "?");
    throw new McpReadError("Lecture Little Emperors impossible.");
  }
  return (data || []) as StoredLe[];
}

async function loadLive(deps?: { listBookings?: () => Promise<LeBooking[]> }) {
  if (deps?.listBookings) return { bookings: await deps.listBookings(), failed: false, configured: true };
  if (!littleEmperorsConfigured()) return { bookings: null, failed: false, configured: false };
  try {
    return { bookings: await listLittleEmperorsBookings(), failed: false, configured: true };
  } catch (err) {
    if (err instanceof LittleEmperorsError) return { bookings: null, failed: true, configured: true };
    throw err;
  }
}

type ItemRef = {
  booking_id?: string | null;
  confirmation_ref?: string | null;
  details?: Record<string, unknown> | null;
};

function itemMatchesConfirmation(item: ItemRef, confirmation: string) {
  const refs = [item.confirmation_ref];
  const rooms = Array.isArray(item.details?.rooms) ? item.details.rooms : [];
  for (const room of rooms) {
    if (room && typeof room === "object") refs.push((room as { confirmation_ref?: string | null }).confirmation_ref);
  }
  return refs.some((ref) => confirmationRefsAlign(ref, confirmation));
}

function confirmationNeedles(confirmation: string) {
  const stem = hotelBookingStem(confirmation);
  return [
    ...new Set(
      [...referenceTokens(confirmation), ...(stem ? [stem.toLowerCase()] : [])].map((token) =>
        token.replace(/[%_]/g, "")
      )
    ),
  ].filter((token) => token.length >= 4);
}

function cardRefs(item: ItemRef) {
  const refs = [item.confirmation_ref];
  const rooms = Array.isArray(item.details?.rooms) ? item.details.rooms : [];
  for (const room of rooms) {
    if (room && typeof room === "object") refs.push((room as { confirmation_ref?: string | null }).confirmation_ref);
  }
  return refs.filter((ref): ref is string => Boolean(ref && ref.trim()));
}

/** Une confirmation d’hôtel (numéro de chambre) retrouve la réservation Little Emperors de la même carte. */
async function matchesViaHotelCards(admin: Admin, rows: LeCandidate[], confirmation: string) {
  const cards = await hotelCardsForConfirmation(admin, confirmation);
  const refs = cards.flatMap(cardRefs);
  if (!refs.length) return [];
  return rows.filter((row) => refs.some((ref) => confirmationMatch(row.booking, ref)));
}

async function hotelCardsForConfirmation(admin: Admin, confirmation: string): Promise<ItemRef[]> {
  const needles = confirmationNeedles(confirmation);
  if (!needles.length) return [];
  const probes = [...new Set([confirmation.trim(), ...needles, ...needles.map((token) => token.toUpperCase())])].filter(
    (token) => token.length >= 4
  );
  const found = new Map<string, ItemRef>();
  const remember = (list: ItemRef[] | null) => {
    for (const row of list || []) {
      if (!row.booking_id || !itemMatchesConfirmation(row, confirmation)) continue;
      found.set(`${row.booking_id}:${cardRefs(row).join("|")}`, row);
    }
  };
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("booking_id, confirmation_ref, details")
    .eq("kind", "hotel")
    .or(needles.map((token) => `confirmation_ref.ilike.%${token}%`).join(","))
    .limit(30);
  if (error) {
    console.error("[mcp] little-emperors-carte", error.code ?? "?");
    throw new McpReadError("Dossier introuvable.");
  }
  remember((data || []) as ItemRef[]);
  for (const token of probes) {
    const nested = await admin
      .from("crm_booking_items")
      .select("booking_id, confirmation_ref, details")
      .eq("kind", "hotel")
      .contains("details", { rooms: [{ confirmation_ref: token }] })
      .limit(30);
    if (nested.error) {
      console.error("[mcp] little-emperors-carte", nested.error.code ?? "?");
      throw new McpReadError("Dossier introuvable.");
    }
    remember((nested.data || []) as ItemRef[]);
  }
  return [...found.values()];
}

async function dossiersForConfirmation(admin: Admin, confirmation: string | null): Promise<LeDossierRef[]> {
  if (!confirmation) return [];
  const needles = confirmationNeedles(confirmation);
  if (!needles.length) return [];
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("booking_id, confirmation_ref, details")
    .eq("kind", "hotel")
    .or(needles.map((token) => `confirmation_ref.ilike.%${token}%`).join(","))
    .limit(30);
  if (error) {
    console.error("[mcp] little-emperors-dossier", error.code ?? "?");
    throw new McpReadError("Dossier introuvable.");
  }
  const ids = new Set<string>();
  for (const row of (data || []) as ItemRef[]) {
    if (!row.booking_id || !itemMatchesConfirmation(row, confirmation)) continue;
    ids.add(row.booking_id);
  }
  if (!ids.size) return [];
  const { data: bookings, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, reference, title")
    .in("id", [...ids]);
  if (bookingError) throw new McpReadError("Dossier introuvable.");
  return ((bookings || []) as { id: string; reference: string | null; title: string | null }[]).map((row) => ({
    id: row.id,
    reference: row.reference,
    titre: row.title,
  }));
}

async function dossierById(admin: Admin, id: string): Promise<LeDossierRef | null> {
  const { data, error } = await admin.from("crm_bookings").select("id, reference, title").eq("id", id).maybeSingle();
  if (error) throw new McpReadError("Dossier introuvable.");
  if (!data) return null;
  const row = data as { id: string; reference: string | null; title: string | null };
  return { id: row.id, reference: row.reference, titre: row.title };
}

async function linkedDossier(admin: Admin, row: LeCandidate) {
  if (row.crmBookingId) {
    const linked = await dossierById(admin, row.crmBookingId);
    if (linked) return { dossier: linked, dossiers: [linked] };
  }
  const found = await dossiersForConfirmation(admin, row.booking.confirmation_number);
  if (found.length === 1) return { dossier: found[0], dossiers: found };
  return { dossier: null, dossiers: found };
}

export async function loadLeReservation(
  input: Record<string, unknown>,
  admin?: Admin,
  deps?: { listBookings?: () => Promise<LeBooking[]> }
) {
  const query = leLookup(input);
  const client = db(admin);
  const [stored, live] = await Promise.all([loadStored(client), loadLive(deps)]);
  const rows = mergeReservations(stored, live.bookings);
  if (!rows.length) {
    throw new McpReadError(live.configured ? "Lecture Little Emperors impossible." : "Little Emperors n’est pas configuré.");
  }
  let matches = selectLeReservations(rows, query);
  if (!matches.length && query.confirmation) {
    matches = await matchesViaHotelCards(client, rows, query.confirmation);
  }
  if (!matches.length) throw new McpReadError("Aucune réservation Little Emperors pour cette recherche.");
  if (matches.length > 1) ambiguity(matches);
  const chosen = matches[0];
  const link = await linkedDossier(client, chosen);
  return { booking: chosen.booking, source: chosen.source, ...link };
}

const QUIET_CANCELLATION: CancellationVerdict = { suivi: null, alerte: false, remplacee_par: null };

async function verdictForBooking(admin: Admin, booking: LeBooking): Promise<CancellationVerdict> {
  if (!isLeCancelled(booking.state)) return QUIET_CANCELLATION;
  const known = await loadStayAnchors(admin);
  return leCancellationVerdict(
    {
      confirmation_number: booking.confirmation_number,
      state: booking.state,
      hotel_name: booking.hotel_name,
      hotel_id: booking.hotel_id,
      check_in: booking.check_in,
      check_out: booking.check_out,
      guest_names: booking.guest_names,
      le_booking_id: Number.isFinite(booking.id) ? booking.id : null,
    },
    known
  );
}

/** Lecture d’une réservation, y compris déjà rattachée à un dossier. */
export async function readReservationLittleEmperors(
  input: Record<string, unknown>,
  admin?: Admin,
  deps?: { listBookings?: () => Promise<LeBooking[]> }
) {
  const loaded = await loadLeReservation(input, admin, deps);
  const client = db(admin);
  const verdict = await verdictForBooking(client, loaded.booking);
  const view = presentLeReservation(loaded.booking, loaded.dossier, {
    dossiers: loaded.dossiers,
    source: loaded.source,
  });
  return {
    ...view,
    statut: cancellationStatut(view.statut, verdict),
    suivi: verdict.suivi,
    alerte: verdict.alerte,
    remplacee_par: verdict.remplacee_par,
  };
}
