import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { confirmationRefsAlign } from "@/lib/crm/email-match";
import { leBookingExtract } from "@/lib/crm/little-emperors-match";
import { joinConfirmationRefs } from "@/lib/crm/item-match";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import {
  benefitsFromLeRaw,
  isLeCancelled,
  leCreatedDossierStatus,
  leDateOnly,
  LittleEmperorsError,
  parseLeBooking,
  splitGuestName,
  type LeBooking,
} from "@/lib/crm/little-emperors";
import { parseMoney } from "@/lib/crm/money";
import { foldName, namesReferToSamePerson } from "@/lib/crm/person-match";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = SupabaseClient;

export type LeImportInput = {
  ids?: string[];
  references?: string[];
  customerId: string;
  dossierId?: string | null;
  dossierReference?: string | null;
  voyageurs?: string[];
  force?: boolean;
};

type StoredRow = {
  id: string;
  le_booking_id?: number | string | null;
  confirmation_number?: string | null;
  state?: string | null;
  crm_booking_id?: string | null;
  hotel_id?: number | null;
  hotel_name?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  currency?: string | null;
  total_cost?: string | null;
  is_cancellable?: boolean | null;
  cancellation_deadline?: string | null;
  guest_names?: string[] | null;
  cancellation_policies?: string[] | null;
  room_types?: string[] | null;
  raw?: unknown;
};

type Picked = StoredRow & { booking: LeBooking };

type DossierRow = {
  id: string;
  reference: string | null;
  customer_id: string | null;
  status: string | null;
  visible_to_client?: boolean | null;
};

type Person = { first_name: string; last_name: string };

type Persist = (opts: {
  customerId: string;
  extract: BookingExtract;
  status: "draft" | "confirmed";
  visibleToClient: boolean;
}) => Promise<{ id: string; reference: string }>;

type Apply = (opts: {
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  visibleToClient: boolean;
  keepSellingPrice: boolean;
}) => Promise<unknown>;

export type LeImportDeps = {
  admin?: Admin;
  persist?: Persist;
  apply?: Apply;
  refresh?: (bookingId: string) => Promise<void>;
  rememberHotel?: (hotelId: number, bookingId: string) => Promise<void>;
  deleteBooking?: (bookingId: string) => Promise<void>;
};

function fail(message: string, status: number, code: string): never {
  throw new LittleEmperorsError(message, status, code);
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

/** Annulée ou en échec : l’import attend `forcer`. */
export function leImportBlocked(state: string | null | undefined): "annulee" | "echec" | null {
  if (isLeCancelled(state)) return "annulee";
  const value = String(state || "")
    .trim()
    .toLowerCase();
  if (value === "failed" || value === "failure" || value === "booking_failed") return "echec";
  return null;
}

export function leImportInput(raw: Record<string, unknown>): LeImportInput {
  const customerId = String(raw.client_id || raw.customerId || "").trim();
  if (!UUID.test(customerId)) fail("Client invalide.", 422, "client");
  const dossierRaw = String(raw.dossier_id || raw.dossierId || "").trim();
  if (dossierRaw && !UUID.test(dossierRaw)) fail("Dossier invalide.", 422, "dossier");
  const references = [
    ...textList(raw.reference),
    ...textList(raw.references),
    ...textList(raw.regroupement),
  ];
  const ids = textList(raw.ids || raw.id);
  if (!references.length && !ids.length) fail("Indiquez la référence Little Emperors.", 422, "reference");
  const voyageurs = textList(raw.voyageurs);
  return {
    ids,
    references,
    customerId,
    dossierId: dossierRaw || null,
    dossierReference: String(raw.dossier_reference || raw.dossierReference || "").trim() || null,
    voyageurs,
    force: raw.forcer === true || raw.force === true,
  };
}

function bookingFromRow(row: StoredRow): LeBooking {
  const raw = row.raw && typeof row.raw === "object" ? (row.raw as Record<string, unknown>) : {};
  const parsed = parseLeBooking({ ...raw, id: raw.id ?? row.le_booking_id });
  const guests = stringList(row.guest_names);
  const roomTypes = stringList(row.room_types);
  const policies = stringList(row.cancellation_policies);
  const benefits = stringList(raw.benefits);
  return {
    id: Number(row.le_booking_id ?? parsed?.id ?? 0),
    hotel_id: row.hotel_id ?? parsed?.hotel_id ?? null,
    hotel_name: row.hotel_name || parsed?.hotel_name || null,
    city: row.city || parsed?.city || null,
    address: row.address || parsed?.address || null,
    website: (typeof row.website === "string" && row.website) || parsed?.website || null,
    check_in: leDateOnly(row.check_in) || parsed?.check_in || null,
    check_out: leDateOnly(row.check_out) || parsed?.check_out || null,
    state: row.state || parsed?.state || null,
    confirmation_number: row.confirmation_number || parsed?.confirmation_number || null,
    total_cost: row.total_cost || parsed?.total_cost || null,
    currency: row.currency || parsed?.currency || null,
    public_price: parsed?.public_price ?? null,
    public_currency: parsed?.public_currency ?? null,
    board: parsed?.board ?? (typeof raw.board === "string" ? raw.board : null),
    hotel_confirmations: parsed?.hotel_confirmations?.length
      ? parsed.hotel_confirmations
      : stringList(raw.hotel_confirmations),
    is_cancellable: typeof row.is_cancellable === "boolean" ? row.is_cancellable : parsed?.is_cancellable ?? null,
    cancellation_deadline: row.cancellation_deadline || parsed?.cancellation_deadline || null,
    guest_names: guests.length ? guests : parsed?.guest_names || [],
    cancellation_policies: policies.length ? policies : parsed?.cancellation_policies || [],
    room_types: roomTypes.length ? roomTypes : parsed?.room_types || [],
    benefits: benefits.length ? benefits : benefitsFromLeRaw(raw).length ? benefitsFromLeRaw(raw) : parsed?.benefits || [],
    rooms: parsed?.rooms?.length ? parsed.rooms : undefined,
  };
}

function bookingRefs(booking: LeBooking) {
  return [
    booking.confirmation_number,
    ...(booking.hotel_confirmations || []),
    ...(booking.rooms || []).map((room) => room.hotel_confirmation),
  ];
}

export function leRowMatchesReference(booking: LeBooking, reference: string) {
  const needle = reference.trim();
  if (!needle) return false;
  return bookingRefs(booking).some((ref) => confirmationRefsAlign(ref, needle));
}

function refLabel(booking: LeBooking) {
  return booking.confirmation_number || booking.hotel_confirmations?.[0] || "cette réservation";
}

/** Carte hôtel remplie depuis Little Emperors. Le net n’est pas le prix vendu. */
export function leImportExtract(booking: LeBooking, extra: Person[] = [], force = false): BookingExtract {
  const extract = leBookingExtract(booking);
  if (force) extract.document_status = null;
  const item = extract.items[0];
  if (item) {
    const details = { ...(item.details || {}) } as Record<string, unknown>;
    const board = booking.board || booking.rooms?.find((room) => room.board)?.board || null;
    if (board && !details.board) details.board = board;
    const net = parseMoney(booking.total_cost);
    if (net != null) {
      const currency = (booking.currency || "EUR").trim().toUpperCase() || "EUR";
      details.supplier_net = net;
      details.supplier_currency = currency;
      if (currency === "EUR") details.supplier_net_eur = net;
    }
    let confirmation = item.confirmation_ref || null;
    for (const ref of bookingRefs(booking)) confirmation = joinConfirmationRefs(confirmation, ref);
    item.confirmation_ref = confirmation;
    if (booking.rooms?.length) {
      details.rooms = booking.rooms.map((room) => ({
        room: null,
        type: room.room_type,
        guests: room.guest_name,
        confirmation_ref: room.hotel_confirmation || booking.confirmation_number,
        ...(room.board ? { board: room.board } : {}),
      }));
    }
    item.details = details;
  }
  const seen = new Set(
    (extract.travelers || []).map((person) => `${foldName(person.first_name)}|${foldName(person.last_name)}`)
  );
  for (const person of extra) {
    const key = `${foldName(person.first_name)}|${foldName(person.last_name)}`;
    if (!key || key === "|" || seen.has(key)) continue;
    seen.add(key);
    extract.travelers.push(person);
  }
  return extract;
}

function mergeExtracts(parts: BookingExtract[]): BookingExtract {
  const base = parts[0];
  const items = parts.flatMap((part) => part.items || []);
  const travelers: BookingExtract["travelers"] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const person of part.travelers || []) {
      const key = `${foldName(person.first_name)}|${foldName(person.last_name)}`;
      if (!key || key === "|" || seen.has(key)) continue;
      seen.add(key);
      travelers.push(person);
    }
  }
  const cities: string[] = [];
  for (const item of items) {
    const city = typeof item.details?.city === "string" ? item.details.city.trim() : "";
    if (city && !cities.some((row) => foldName(row) === foldName(city))) cities.push(city);
  }
  const place = cities.join(" · ");
  return {
    ...base,
    destination: place || base.destination,
    title: place || base.title,
    travelers,
    items,
    document_status: parts.find((part) => part.document_status)?.document_status || null,
  };
}

function parsePeople(names: string[]): Person[] {
  return names.map((name) => {
    const person = splitGuestName(name);
    if (!person) fail(`Indiquez le prénom et le nom (${name}).`, 422, "voyageur");
    return person;
  });
}

async function rowsOf(admin: Admin): Promise<StoredRow[]> {
  const rows: StoredRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await admin.from("crm_le_bookings").select("*").range(from, from + 999);
    if (error) fail("Lecture Little Emperors impossible.", 500, "stored");
    rows.push(...((data || []) as StoredRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function pickRows(stored: StoredRow[], input: LeImportInput): Picked[] {
  const byId = new Map(stored.map((row) => [row.id, row]));
  const picked: Picked[] = [];
  const seen = new Set<string>();
  const push = (row: StoredRow | undefined, missing: string) => {
    if (!row) fail(missing, 404, "not_found");
    if (seen.has(row.id)) return;
    seen.add(row.id);
    picked.push({ ...row, booking: bookingFromRow(row) });
  };
  for (const id of input.ids || []) push(byId.get(id), "Réservation Little Emperors introuvable.");
  for (const reference of input.references || []) {
    const hits = stored.filter((row) => leRowMatchesReference(bookingFromRow(row), reference));
    if (!hits.length) fail(`Réservation Little Emperors introuvable (${reference}).`, 404, "not_found");
    if (hits.length > 1) fail(`Plusieurs réservations Little Emperors portent ${reference}.`, 409, "ambiguous");
    push(hits[0], `Réservation Little Emperors introuvable (${reference}).`);
  }
  return picked;
}

async function dossierBy(admin: Admin, column: "id" | "reference", value: string): Promise<DossierRow | null> {
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, status, visible_to_client")
    .eq(column, value);
  if (error) fail("Dossier introuvable.", 500, "dossier");
  const rows = (data || []) as DossierRow[];
  if (rows.length > 1) fail("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.", 409, "ambiguous");
  return rows[0] || null;
}

async function labelsOf(admin: Admin, ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await admin.from("crm_bookings").select("id, reference").in("id", ids);
  if (error) return map;
  for (const row of (data || []) as { id: string; reference: string | null }[]) {
    map.set(row.id, row.reference || row.id);
  }
  return map;
}

function assertImportable(rows: Picked[], input: LeImportInput, targetId: string | null, labels: Map<string, string>) {
  for (const row of rows) {
    const blocked = leImportBlocked(row.booking.state);
    if (blocked && !input.force) {
      const label = refLabel(row.booking);
      fail(
        blocked === "annulee"
          ? `La réservation ${label} est annulée chez Little Emperors. Elle ne crée pas de dossier.`
          : `La réservation ${label} est en échec chez Little Emperors. Elle ne crée pas de dossier.`,
        409,
        blocked === "annulee" ? "cancelled" : "failed"
      );
    }
    if (!row.booking.hotel_name) fail("Little Emperors n’a pas indiqué le nom de l’hôtel.", 422, "hotel_name");
    if (row.crm_booking_id && row.crm_booking_id !== targetId) {
      const where = labels.get(row.crm_booking_id) || row.crm_booking_id;
      fail(`La réservation ${refLabel(row.booking)} est déjà rattachée au dossier ${where}.`, 409, "linked");
    }
  }
}

async function ensureCompanions(admin: Admin, customer: Person & { id: string }, people: Person[]) {
  const { data, error } = await admin
    .from("crm_travel_companions")
    .select("id, first_name, last_name")
    .eq("customer_id", customer.id);
  if (error) fail("Voyageur non ajouté.", 500, "companion");
  const companions = (data || []) as { id: string; first_name: string | null; last_name: string | null }[];
  for (const person of people) {
    if (namesReferToSamePerson(person, customer)) continue;
    if (companions.some((row) => namesReferToSamePerson(person, row))) continue;
    const { data: created, error: insertError } = await admin
      .from("crm_travel_companions")
      .insert({ customer_id: customer.id, first_name: person.first_name, last_name: person.last_name })
      .select("id, first_name, last_name")
      .single();
    if (insertError || !created) fail("Voyageur non ajouté.", 500, "companion");
    companions.push(created as { id: string; first_name: string | null; last_name: string | null });
  }
}

async function defaultAdmin() {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  return createServiceClient({ allowPreview: true });
}

async function defaultPersist(opts: Parameters<Persist>[0]) {
  const { persistNewBookingFromExtract } = await import("@/lib/crm/ingest-booking");
  const saved = await persistNewBookingFromExtract(opts);
  return { id: saved.id, reference: saved.reference };
}

async function defaultApply(opts: Parameters<Apply>[0]) {
  const { applyExtractToBooking } = await import("@/lib/crm/ingest-booking");
  return applyExtractToBooking(opts);
}

async function defaultRefresh(bookingId: string) {
  const { refreshBookingDerived } = await import("@/lib/crm/dossier-refresh");
  await refreshBookingDerived(bookingId);
}

async function defaultRemember(admin: Admin, hotelId: number, bookingId: string) {
  const { persistLittleEmperorsHotelContacts } = await import("@/lib/crm/le-hotel-contacts");
  await persistLittleEmperorsHotelContacts({ hotelId, crmBookingId: bookingId, admin });
}

async function defaultDelete(bookingId: string) {
  const { deleteBookingById } = await import("@/lib/crm/delete-booking");
  await deleteBookingById(bookingId);
}

/**
 * Crée un dossier Non visible, ou rattache les réservations à un dossier déjà ouvert.
 * Aucune invitation, aucun message. Un dossier déjà Visible n’est pas recaché.
 * Les cartes neuves restent cachées jusqu’à Montrer au client.
 */
export async function importLittleEmperorsReservations(input: LeImportInput, deps: LeImportDeps = {}) {
  const admin = deps.admin ?? (await defaultAdmin());
  const stored = await rowsOf(admin);
  const picked = pickRows(stored, input);
  if (!picked.length) fail("Indiquez la référence Little Emperors.", 422, "reference");
  const target = input.dossierId
    ? await dossierBy(admin, "id", input.dossierId)
    : input.dossierReference
      ? await dossierBy(admin, "reference", input.dossierReference)
      : null;
  if ((input.dossierId || input.dossierReference) && !target) fail("Dossier introuvable.", 404, "dossier");
  const labels = await labelsOf(
    admin,
    picked.map((row) => row.crm_booking_id).filter((id): id is string => Boolean(id))
  );
  assertImportable(picked, input, target?.id || null, labels);
  const { data: customer, error: customerError } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name")
    .eq("id", input.customerId)
    .maybeSingle();
  if (customerError || !customer) fail("Client introuvable.", 404, "client");
  const holder = customer as { id: string; first_name: string | null; last_name: string | null };
  if (target && target.customer_id !== holder.id) {
    fail("Ce dossier n’appartient pas à ce client.", 409, "customer");
  }
  const pending = picked.filter((row) => row.crm_booking_id !== target?.id);
  if (!pending.length && target) {
    return {
      dossier_id: target.id,
      reference: target.reference,
      bookingId: target.id,
      cree: false,
      deja: true,
      statut: target.status,
      visible_client: Boolean(target.visible_to_client),
      cartes: [],
      reservations: picked.map((row) => ({ id: row.id, reference: refLabel(row.booking) })),
      message: false as const,
      invite: false as const,
    };
  }
  const extras = parsePeople(input.voyageurs || []);
  const guests = pending.flatMap((row) =>
    row.booking.guest_names.map(splitGuestName).filter((person): person is Person => Boolean(person))
  );
  await ensureCompanions(admin, { id: holder.id, first_name: holder.first_name || "", last_name: holder.last_name || "" }, [
    ...guests,
    ...extras,
  ]);
  const extracts = pending.map((row, index) => leImportExtract(row.booking, index === 0 ? extras : [], input.force));
  const merged = mergeExtracts(extracts);
  const persist = deps.persist ?? defaultPersist;
  const apply = deps.apply ?? defaultApply;
  const createdStatus = leCreatedDossierStatus(pending[0]?.booking.state);
  let cree = false;
  let dossierId = target?.id || "";
  let reference = target?.reference || null;
  let visible = Boolean(target?.visible_to_client);
  if (!target) {
    const saved = await persist({
      customerId: holder.id,
      extract: merged,
      status: createdStatus,
      visibleToClient: false,
    });
    cree = true;
    dossierId = saved.id;
    reference = saved.reference;
    visible = false;
    const { error } = await admin
      .from("crm_bookings")
      .update({
        notes_internal: "Réservation importée depuis Little Emperors.",
        status: createdStatus,
        visible_to_client: false,
      })
      .eq("id", dossierId);
    if (error) fail("Dossier non enregistré.", 500, "dossier");
  } else {
    await apply({
      bookingId: target.id,
      customerId: holder.id,
      extract: merged,
      visibleToClient: false,
      keepSellingPrice: true,
    });
  }
  try {
    for (const row of pending) {
      const { error } = await admin
        .from("crm_le_bookings")
        .update({ crm_booking_id: dossierId, status: "linked", last_error: null })
        .eq("id", row.id);
      if (error) fail("Réservation non rattachée.", 500, "link");
    }
  } catch (err) {
    if (cree) {
      try {
        await (deps.deleteBooking ?? defaultDelete)(dossierId);
      } catch {
        // Le dossier reste si le retrait échoue. Le rattachement n’est pas à moitié caché.
      }
    }
    throw err;
  }
  const remember = deps.rememberHotel ?? ((hotelId: number, bookingId: string) => defaultRemember(admin, hotelId, bookingId));
  for (const row of pending) {
    if (row.booking.hotel_id != null) await remember(row.booking.hotel_id, dossierId);
  }
  await (deps.refresh ?? defaultRefresh)(dossierId);
  const hotel = (merged.items || []).filter((item) => item.kind === "hotel");
  return {
    dossier_id: dossierId,
    reference,
    bookingId: dossierId,
    cree,
    deja: false,
    statut: !visible && target?.status === "cancelled" ? "annule" : visible ? "visible" : "non_visible",
    visible_client: visible,
    cartes: hotel.map((item) => ({
      hotel: item.title,
      ville: typeof item.details?.city === "string" ? item.details.city : null,
      arrivee: item.start_at,
      depart: item.end_at,
      confirmation: item.confirmation_ref,
      regime: typeof item.details?.board === "string" ? item.details.board : null,
      net: typeof item.details?.supplier_net === "number" ? item.details.supplier_net : null,
      devise_net: typeof item.details?.supplier_currency === "string" ? item.details.supplier_currency : null,
    })),
    reservations: picked.map((row) => ({ id: row.id, reference: refLabel(row.booking) })),
    message: false as const,
    invite: false as const,
  };
}

export async function importLittleEmperorsFromMcp(raw: Record<string, unknown>, deps?: LeImportDeps) {
  const { McpWriteError } = await import("@/lib/crm/mcp-write");
  try {
    return await importLittleEmperorsReservations(leImportInput(raw), deps);
  } catch (err) {
    if (err instanceof LittleEmperorsError || err instanceof BookingIssuesError) throw new McpWriteError(err.message);
    if (err instanceof McpWriteError) throw err;
    throw new McpWriteError("Import Little Emperors impossible.");
  }
}
