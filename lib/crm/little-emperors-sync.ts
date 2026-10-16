import { cancellationApplyPlan } from "@/lib/crm/email-match";
import { applyCancellationToBooking, applyReplacementToBooking, persistNewBookingFromExtract } from "@/lib/crm/ingest-booking";
import { persistLittleEmperorsHotelContacts } from "@/lib/crm/le-hotel-contacts";
import {
  leBookingExtract,
  planLeCarnetWrite,
  suggestLittleEmperorsBooking,
  type LeWritePlan,
} from "@/lib/crm/little-emperors-match";
import {
  applyHotelPublicFields,
  cancelLittleEmperorsBooking,
  createLittleEmperorsBooking,
  fetchLittleEmperorsHotel,
  benefitsFromLeRaw,
  isLeCancelled,
  listLittleEmperorsBookings,
  parseLeBooking,
  LittleEmperorsError,
  splitGuestName,
  type LeBooking,
} from "@/lib/crm/little-emperors";
import type { LeHotelCatalog } from "@/lib/crm/hotel-contact";
import type { LifecycleCard } from "@/lib/crm/item-lifecycle";
import { loyaltyFromCustomer } from "@/lib/crm/loyalty";
import { countsAsCarnetCard, type CrmBookingItem, type CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const PROVIDER = "little_emperors";

/** La preview porte la clé de test : elle doit pouvoir écrire la lecture. */
function leAdmin() {
  return createServiceClient({ allowPreview: true });
}

const LATE_CANCEL =
  "La date limite d’annulation est passée. Écrivez à bookings@littleemperors.com : la politique d’annulation s’applique.";

const LE_IMPORT_NOTE = "Réservation importée depuis Little Emperors.";

function foldName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function namedCustomerIds(
  booking: LeBooking,
  customers: { id: string; first_name: string | null; last_name: string | null }[]
) {
  const person = splitGuestName(booking.guest_names[0] || "");
  if (!person) return [];
  return customers
    .filter(
      (row) =>
        foldName(row.first_name) === foldName(person.first_name) &&
        foldName(row.last_name) === foldName(person.last_name)
    )
    .map((row) => row.id);
}

async function loadLifecycle(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, confirmation_ref, start_at, end_at, details, lifecycle, amount, include_in_ledger")
    .eq("booking_id", bookingId);
  return (data || []) as LifecycleCard[];
}

async function customerIdOf(admin: SupabaseClient, bookingId: string, known: { id: string; customer_id: string | null }[]) {
  const hit = known.find((row) => row.id === bookingId);
  if (hit?.customer_id) return hit.customer_id;
  const { data } = await admin.from("crm_bookings").select("customer_id").eq("id", bookingId).maybeSingle();
  return (data?.customer_id as string | undefined) || null;
}

async function ensureLeCustomer(admin: SupabaseClient, firstName: string, lastName: string) {
  const { data: named } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name")
    .ilike("last_name", lastName);
  const hits = (named || []).filter(
    (row) => foldName(row.first_name) === foldName(firstName) && foldName(row.last_name) === foldName(lastName)
  );
  if (hits.length > 1) throw new LittleEmperorsError(LE_HOLD_CUSTOMERS, 409, "customers");
  if (hits.length === 1 && hits[0].id) return hits[0].id as string;
  const { data: created, error } = await admin
    .from("crm_customers")
    .insert({ first_name: firstName, last_name: lastName, language: "fr" })
    .select("id")
    .single();
  if (error || !created?.id) throw new LittleEmperorsError("Création de la fiche impossible.", 500, "customer");
  return created.id as string;
}

const LE_HOLD_CUSTOMERS = "Plusieurs fiches portent ce nom. Choisissez le client.";

async function executeLePlan(admin: SupabaseClient, booking: LeBooking, plan: LeWritePlan) {
  if (plan.kind === "hold") return { crmBookingId: null as string | null, lastError: plan.message, cancelled: false, created: false };
  const extract = leBookingExtract(booking);
  if (plan.kind === "cancel") {
    const result = await reflectCancellation(admin, plan.bookingId, booking);
    return {
      crmBookingId: plan.bookingId,
      lastError: result === "unmatched_card" ? "Annulation Little Emperors reçue, sans carte hôtel correspondante sur le dossier." : null,
      cancelled: result === "cancelled",
      created: false,
    };
  }
  if (plan.kind === "replace") {
    await applyReplacementToBooking({
      bookingId: plan.bookingId,
      customerId: plan.customerId,
      extract,
      visibleToClient: false,
    });
    return { crmBookingId: plan.bookingId, lastError: null, cancelled: false, created: false };
  }
  const customerId =
    plan.kind === "create" ? plan.customerId : await ensureLeCustomer(admin, plan.firstName, plan.lastName);
  const created = await persistNewBookingFromExtract({
    customerId,
    extract,
    status: "draft",
    visibleToClient: false,
  });
  await admin.from("crm_bookings").update({ notes_internal: LE_IMPORT_NOTE, status: "draft" }).eq("id", created.id);
  return { crmBookingId: created.id, lastError: null, cancelled: false, created: true };
}

export type LeSyncResult = {
  ok: boolean;
  fetched: number;
  linked: number;
  cancelled: number;
  message?: string;
  status?: number;
  code?: string;
};

function rowFromBooking(booking: LeBooking, extra: Record<string, unknown> = {}) {
  return {
    le_booking_id: booking.id,
    confirmation_number: booking.confirmation_number,
    state: booking.state,
    hotel_id: booking.hotel_id,
    hotel_name: booking.hotel_name,
    address: booking.address,
    city: booking.city,
    website: booking.website,
    check_in: booking.check_in,
    check_out: booking.check_out,
    currency: booking.currency,
    total_cost: booking.total_cost,
    is_cancellable: booking.is_cancellable,
    cancellation_deadline: booking.cancellation_deadline,
    guest_names: booking.guest_names,
    cancellation_policies: booking.cancellation_policies,
    room_types: booking.room_types,
    raw: booking,
    ...extra,
  };
}

async function rememberProbe(
  admin: SupabaseClient,
  patch: { last_status: number; last_error: string | null; last_ok_at?: string | null }
) {
  await admin.from("crm_le_sync").upsert({ provider: PROVIDER, ...patch });
}

async function enrich(bookings: LeBooking[], fetchImpl?: typeof fetch) {
  const hotels = new Map<number, Awaited<ReturnType<typeof fetchLittleEmperorsHotel>>>();
  const out: LeBooking[] = [];
  for (const booking of bookings) {
    if (booking.hotel_id == null) {
      out.push(booking);
      continue;
    }
    let hotel = hotels.get(booking.hotel_id);
    if (!hotel) {
      try {
        hotel = await fetchLittleEmperorsHotel(booking.hotel_id, fetchImpl);
        hotels.set(booking.hotel_id, hotel);
      } catch {
        out.push(booking);
        continue;
      }
    }
    out.push(applyHotelPublicFields(booking, hotel));
  }
  return out;
}

function hotelCatalogCache(admin: SupabaseClient, fetchImpl?: typeof fetch) {
  const seen = new Map<number, LeHotelCatalog | null>();
  return async function remember(hotelId: number, crmBookingId?: string | null) {
    const cached = seen.get(hotelId);
    if (cached !== undefined) {
      if (crmBookingId && cached) {
        await persistLittleEmperorsHotelContacts({
          hotelId,
          catalog: cached,
          crmBookingId,
          admin,
          fetchImpl,
        });
      }
      return cached;
    }
    const catalog = await persistLittleEmperorsHotelContacts({
      hotelId,
      crmBookingId,
      admin,
      fetchImpl,
    });
    seen.set(hotelId, catalog);
    return catalog;
  };
}

async function loadMatchContext(admin: SupabaseClient) {
  const [{ data: bookings }, { data: items }, { data: customers }] = await Promise.all([
    admin
      .from("crm_bookings")
      .select("id, reference, title, destination, customer_id, status, start_date, end_date")
      .neq("status", "cancelled")
      .is("archived_at", null),
    admin.from("crm_booking_items").select("booking_id, confirmation_ref"),
    admin.from("crm_customers").select("id, first_name, last_name, usage_name, company_name, email"),
  ]);
  const itemsByBooking = new Map<string, Pick<CrmBookingItem, "confirmation_ref">[]>();
  for (const item of items || []) {
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push({ confirmation_ref: item.confirmation_ref });
    itemsByBooking.set(item.booking_id, list);
  }
  return {
    bookings: bookings || [],
    itemsByBooking,
    customers: (customers || []) as (Pick<
      CrmCustomer,
      "id" | "first_name" | "last_name" | "company_name" | "email"
    > & { usage_name?: string | null })[],
  };
}

async function reflectCancellation(admin: SupabaseClient, crmBookingId: string, booking: LeBooking) {
  const { data: dossier } = await admin
    .from("crm_bookings")
    .select("id, customer_id, status, archived_at")
    .eq("id", crmBookingId)
    .maybeSingle();
  if (!dossier || dossier.status === "cancelled" || dossier.archived_at) return "already";
  const { data: items } = await admin.from("crm_booking_items").select("*").eq("booking_id", crmBookingId);
  const cards = (items || []) as CrmBookingItem[];
  const extract = leBookingExtract({ ...booking, state: "cancelled" });
  const plan = cancellationApplyPlan(extract, cards);
  const hasCards = cards.some((item) => countsAsCarnetCard(item.kind));
  if (plan.itemIds.length === 0 && hasCards) {
    return "unmatched_card";
  }
  await applyCancellationToBooking({
    bookingId: crmBookingId,
    customerId: dossier.customer_id,
    extract,
    visibleToClient: false,
  });
  return "cancelled";
}

async function placeLeBooking(
  admin: SupabaseClient,
  booking: LeBooking,
  existing: { crm_booking_id?: string | null; status?: string | null } | null,
  context: Awaited<ReturnType<typeof loadMatchContext>>
) {
  const suggestion = suggestLittleEmperorsBooking(
    booking,
    context.bookings,
    context.itemsByBooking,
    context.customers
  );
  const candidates = suggestion.candidates
    .filter((row) => row.customer_id)
    .map((row) => ({
      customer_id: row.customer_id as string,
      booking_id: row.booking_id,
      label: row.label,
      reason: row.reason,
      score: row.score,
    }));
  const linkedId = existing?.crm_booking_id || null;
  const linkedCustomer = linkedId ? await customerIdOf(admin, linkedId, context.bookings) : null;
  const linked = linkedId && linkedCustomer ? { bookingId: linkedId, customerId: linkedCustomer } : null;
  const targetId = linked?.bookingId || suggestion.autoBookingId;
  const items = targetId ? await loadLifecycle(admin, targetId) : null;
  if (process.env.VERCEL_ENV === "preview") {
    return { crmBookingId: linkedId, lastError: null, cancelled: false, created: false, candidates };
  }
  try {
    const plan = planLeCarnetWrite({
      booking,
      autoBookingId: suggestion.autoBookingId,
      candidates: suggestion.candidates,
      linked,
      items,
      namedCustomerIds: namedCustomerIds(booking, context.customers),
      ignored: existing?.status === "ignored",
    });
    const outcome = await executeLePlan(admin, booking, plan);
    return { ...outcome, crmBookingId: outcome.crmBookingId || linkedId, candidates };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Écriture du séjour impossible.";
    return { crmBookingId: linkedId, lastError: message, cancelled: false, created: false, candidates };
  }
}

export async function syncLittleEmperorsBookings(fetchImpl?: typeof fetch): Promise<LeSyncResult> {
  const admin = leAdmin();
  let fetched: LeBooking[];
  try {
    fetched = await enrich(await listLittleEmperorsBookings(fetchImpl), fetchImpl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lecture Little Emperors impossible.";
    const status = err instanceof LittleEmperorsError ? err.status : 502;
    const code = err instanceof LittleEmperorsError ? err.code : "upstream";
    await rememberProbe(admin, { last_status: status, last_error: message, last_ok_at: null });
    return { ok: false, fetched: 0, linked: 0, cancelled: 0, message, status, code };
  }

  const context = await loadMatchContext(admin);
  const rememberHotel = hotelCatalogCache(admin, fetchImpl);
  let linked = 0;
  let cancelled = 0;
  for (const booking of fetched) {
    const { data: existing } = await admin
      .from("crm_le_bookings")
      .select("id, crm_booking_id, status")
      .eq("le_booking_id", booking.id)
      .maybeSingle();
    const placed = await placeLeBooking(admin, booking, existing, context);
    if (placed.crmBookingId && !existing?.crm_booking_id) linked += 1;
    if (placed.cancelled) cancelled += 1;
    const catalog = booking.hotel_id != null ? await rememberHotel(booking.hotel_id, placed.crmBookingId) : null;
    const payload = rowFromBooking(booking, {
      crm_booking_id: placed.crmBookingId,
      status: placed.crmBookingId ? "linked" : existing?.status === "ignored" ? "ignored" : "unmatched",
      candidates: placed.candidates,
      last_event: isLeCancelled(booking.state) ? "hotel_booking_cancel" : "sync",
      last_error: placed.lastError,
      ...(catalog?.country ? { country: catalog.country } : {}),
      ...(catalog?.website && !booking.website ? { website: catalog.website } : {}),
    });
    if (existing?.id) {
      await admin.from("crm_le_bookings").update(payload).eq("id", existing.id);
    } else {
      await admin.from("crm_le_bookings").insert(payload);
    }
  }
  await rememberProbe(admin, {
    last_status: 200,
    last_error: null,
    last_ok_at: new Date().toISOString(),
  });
  return { ok: true, fetched: fetched.length, linked, cancelled };
}

export async function upsertLittleEmperorsWebhook(event: string, booking: LeBooking) {
  const admin = leAdmin();
  const cancelledRemote = isLeCancelled(booking.state, event);
  const { data: existing } = await admin
    .from("crm_le_bookings")
    .select("id, crm_booking_id, status, website, hotel_name, address, city")
    .eq("le_booking_id", booking.id)
    .maybeSingle();
  let enriched = booking;
  if (booking.hotel_id != null && !booking.website) {
    try {
      enriched = applyHotelPublicFields(booking, await fetchLittleEmperorsHotel(booking.hotel_id));
    } catch {
      enriched = booking;
    }
  }
  const catalog = booking.hotel_id != null ? await persistLittleEmperorsHotelContacts({ hotelId: booking.hotel_id, admin }) : null;
  const merged: LeBooking = {
    ...enriched,
    website: enriched.website || catalog?.website || existing?.website || null,
    hotel_name: enriched.hotel_name || catalog?.hotel_name || existing?.hotel_name || null,
    address: enriched.address || existing?.address || null,
    city: enriched.city || catalog?.city || existing?.city || null,
    state: cancelledRemote ? enriched.state || "cancelled" : enriched.state,
  };
  const context = await loadMatchContext(admin);
  const placed = await placeLeBooking(admin, merged, existing, context);
  const payload = rowFromBooking(merged, {
    crm_booking_id: placed.crmBookingId,
    status: placed.crmBookingId ? "linked" : existing?.status === "ignored" ? "ignored" : "unmatched",
    candidates: placed.candidates,
    last_event: event,
    last_error: placed.lastError,
    ...(catalog?.country ? { country: catalog.country } : {}),
  });
  if (existing?.id) {
    await admin.from("crm_le_bookings").update(payload).eq("id", existing.id);
  } else {
    await admin.from("crm_le_bookings").insert(payload);
  }
  if (placed.crmBookingId && catalog && booking.hotel_id != null) {
    await persistLittleEmperorsHotelContacts({
      hotelId: booking.hotel_id,
      catalog,
      crmBookingId: placed.crmBookingId,
      admin,
    });
  }
  return { cancelled: placed.cancelled ? 1 : 0, created: !existing };
}

function bookingFromRow(row: {
  le_booking_id: number;
  raw?: unknown;
  hotel_id?: number | null;
  hotel_name?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  state?: string | null;
  confirmation_number?: string | null;
  total_cost?: string | null;
  currency?: string | null;
  is_cancellable?: boolean | null;
  cancellation_deadline?: string | null;
  guest_names?: string[] | null;
  cancellation_policies?: string[] | null;
  room_types?: string[] | null;
}): LeBooking | null {
  const parsed =
    parseLeBooking(row.raw) ||
    parseLeBooking({
      id: row.le_booking_id,
      hotel_id: row.hotel_id,
      hotel_name: row.hotel_name,
      city: row.city,
      address: row.address,
      check_in: row.check_in,
      check_out: row.check_out,
      state: row.state,
      confirmation_number: row.confirmation_number,
      total_cost: row.total_cost,
      currency: row.currency,
      is_cancellable: row.is_cancellable,
      cancellation_deadline: row.cancellation_deadline,
      rooms: (row.room_types || []).map((type, index) => ({
        room_type: type,
        guest_name: row.guest_names?.[index] || row.guest_names?.[0] || null,
        cancellation_policy: row.cancellation_policies?.[index] || null,
        benefits: benefitsFromLeRaw(row.raw),
      })),
    });
  if (!parsed) return null;
  return {
    ...parsed,
    id: Number(row.le_booking_id) || parsed.id,
    hotel_name: row.hotel_name || parsed.hotel_name,
    city: row.city || parsed.city,
    address: row.address || parsed.address,
    website: row.website || parsed.website,
    state: row.state || parsed.state,
    confirmation_number: row.confirmation_number || parsed.confirmation_number,
    total_cost: row.total_cost || parsed.total_cost,
    currency: row.currency || parsed.currency,
    guest_names: parsed.guest_names.length ? parsed.guest_names : row.guest_names || [],
    room_types: parsed.room_types.length ? parsed.room_types : row.room_types || [],
    benefits: parsed.benefits.length ? parsed.benefits : benefitsFromLeRaw(row.raw),
  };
}

export async function attachLittleEmperorsBooking(opts: {
  id: string;
  customerId: string;
  referenceClient?: SupabaseClient;
}) {
  const admin = leAdmin();
  const { data: row } = await admin.from("crm_le_bookings").select("*").eq("id", opts.id).maybeSingle();
  if (!row) throw new LittleEmperorsError("Réservation Little Emperors introuvable.", 404, "not_found");
  if (row.crm_booking_id) {
    return { bookingId: row.crm_booking_id as string, already: true };
  }
  if (isLeCancelled(row.state)) {
    throw new LittleEmperorsError(
      "Cette réservation est annulée chez Little Emperors. Elle ne crée pas de dossier.",
      409,
      "cancelled"
    );
  }
  const booking = bookingFromRow(row);
  if (!booking) throw new LittleEmperorsError("Réservation Little Emperors illisible.", 422, "booking");
  if (!booking.hotel_name) {
    throw new LittleEmperorsError("Little Emperors n’a pas indiqué le nom de l’hôtel.", 422, "hotel_name");
  }
  const created = await persistNewBookingFromExtract({
    customerId: opts.customerId,
    extract: leBookingExtract(booking),
    status: "draft",
    visibleToClient: false,
    referenceClient: opts.referenceClient,
  });
  await admin
    .from("crm_bookings")
    .update({
      notes_internal: "Réservation importée depuis Little Emperors.",
    })
    .eq("id", created.id);
  if (booking.website || booking.hotel_id != null) {
    const { data: items } = await admin
      .from("crm_booking_items")
      .select("id, details")
      .eq("booking_id", created.id)
      .eq("kind", "hotel");
    for (const item of items || []) {
      const details = { ...(item.details || {}) } as Record<string, unknown>;
      if (booking.website && !details.website) details.website = booking.website;
      if (booking.hotel_id != null && details.le_hotel_id == null) details.le_hotel_id = booking.hotel_id;
      if (!details.source_family) details.source_family = "little_emperors";
      await admin.from("crm_booking_items").update({ details }).eq("id", item.id);
    }
  }
  if (booking.hotel_id != null) {
    await persistLittleEmperorsHotelContacts({
      hotelId: booking.hotel_id,
      crmBookingId: created.id,
      admin,
    });
  }
  await admin
    .from("crm_le_bookings")
    .update({ crm_booking_id: created.id, status: "linked", last_error: null })
    .eq("id", row.id);
  return { bookingId: created.id, already: false };
}

export async function cancelLittleEmperorsFromCrm(id: string) {
  const admin = leAdmin();
  const { data: row } = await admin.from("crm_le_bookings").select("*").eq("id", id).maybeSingle();
  if (!row) throw new LittleEmperorsError("Réservation Little Emperors introuvable.", 404, "not_found");
  if (row.is_cancellable !== true) {
    throw new LittleEmperorsError(
      row.is_cancellable === false
        ? LATE_CANCEL
        : "Little Emperors n’indique pas que cette réservation peut être annulée depuis l’API.",
      409,
      "not_cancellable"
    );
  }
  await cancelLittleEmperorsBooking(Number(row.le_booking_id));
  const stored = bookingFromRow(row);
  const booking: LeBooking = stored
    ? { ...stored, state: "cancelled", is_cancellable: false }
    : {
        id: Number(row.le_booking_id),
        hotel_id: row.hotel_id,
        hotel_name: row.hotel_name,
        city: row.city,
        address: row.address,
        website: row.website,
        description: null,
        check_in: row.check_in,
        check_out: row.check_out,
        check_in_time: null,
        check_out_time: null,
        latitude: null,
        longitude: null,
        eta: null,
        image: null,
        state: "cancelled",
        confirmation_number: row.confirmation_number,
        total_cost: row.total_cost,
        currency: row.currency,
        is_cancellable: false,
        cancellation_deadline: row.cancellation_deadline,
        guest_names: row.guest_names || [],
        cancellation_policies: row.cancellation_policies || [],
        room_types: row.room_types || [],
        benefits: benefitsFromLeRaw(row.raw),
        rooms: [],
      };
  let lastError: string | null = null;
  if (row.crm_booking_id) {
    const result = await reflectCancellation(admin, row.crm_booking_id, booking);
    if (result === "unmatched_card") {
      lastError = "Annulation envoyée à Little Emperors, sans carte hôtel correspondante sur le dossier.";
    }
  }
  await admin
    .from("crm_le_bookings")
    .update({
      state: "cancelled",
      is_cancellable: false,
      last_event: "crm_cancel",
      last_error: lastError,
    })
    .eq("id", row.id);
  return { ok: true as const };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function assertCarnetWrite() {
  if (process.env.VERCEL_ENV === "preview") {
    throw new LittleEmperorsError(
      "La revue de staging lit Little Emperors. Le carnet s’écrit sur travelba.fr.",
      403,
      "preview_write"
    );
  }
}

export async function quoteLittleEmperorsStay(input: {
  customerId: string;
  hotelName: string;
  city: string | null;
  hotelId: number | null;
  start: string;
  end: string;
  roomName: string | null;
  benefits: string[];
  footnotes: string[];
  cancellation: string | null;
  payment: string | null;
  supplierCost: string | null;
  currency: string | null;
  adults: number | null;
}) {
  assertCarnetWrite();
  if (!DAY.test(input.start) || !DAY.test(input.end)) {
    throw new LittleEmperorsError("Indiquez les dates du séjour.", 422, "dates");
  }
  if (!input.hotelName.trim()) {
    throw new LittleEmperorsError("Little Emperors n’a pas indiqué le nom de l’hôtel.", 422, "hotel_name");
  }
  const booking: LeBooking = {
    id: 0,
    hotel_id: input.hotelId,
    hotel_name: input.hotelName.trim(),
    city: input.city,
    address: null,
    website: null,
    description: null,
    check_in: input.start,
    check_out: input.end,
    check_in_time: null,
    check_out_time: null,
    latitude: null,
    longitude: null,
    eta: null,
    image: null,
    state: "booked",
    confirmation_number: null,
    total_cost: input.supplierCost,
    currency: input.currency,
    is_cancellable: null,
    cancellation_deadline: null,
    guest_names: [],
    cancellation_policies: input.cancellation ? [input.cancellation] : [],
    room_types: input.roomName ? [input.roomName] : [],
    benefits: input.benefits,
    rooms: [
      {
        id: null,
        guest_name: null,
        room_type: input.roomName,
        adults: input.adults,
        children: [],
        cancellation_policy: input.cancellation,
        deposit_policy: input.payment,
        total_cost: input.supplierCost,
        benefits: input.benefits,
        additional_benefits: [],
        benefits_footnotes: input.footnotes,
        public_inclusions: [],
        rate_title: [],
        has_upgrade_benefit: null,
        eta: null,
        images: [],
      },
    ],
  };
  const extract = leBookingExtract(booking);
  extract.document_status = "quote";
  const admin = leAdmin();
  const created = await persistNewBookingFromExtract({
    customerId: input.customerId,
    extract,
    status: "draft",
    visibleToClient: false,
  });
  await admin
    .from("crm_bookings")
    .update({
      status: "draft",
      notes_internal: "Devis Little Emperors. Le coût fournisseur n’est pas le prix vendu.",
    })
    .eq("id", created.id);
  return { bookingId: created.id };
}

export async function bookLittleEmperorsStay(input: {
  customerId: string;
  crmBookingId?: string | null;
  start: string;
  end: string;
  sessionId: string;
  rateIndex: string;
  hotelId: number;
  adults: number;
  childrenAges: number[];
  eta?: string | null;
  loyaltyProgram?: "bonvoy" | "all_accor" | null;
}) {
  assertCarnetWrite();
  if (!DAY.test(input.start) || !DAY.test(input.end)) {
    throw new LittleEmperorsError("Indiquez les dates du séjour.", 422, "dates");
  }
  const admin = leAdmin();
  const { data: customer } = await admin
    .from("crm_customers")
    .select("first_name, last_name, email, loyalty, flying_blue")
    .eq("id", input.customerId)
    .maybeSingle();
  if (!customer) throw new LittleEmperorsError("Client introuvable.", 404, "customer");
  const guest = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  if (!splitGuestName(guest)) {
    throw new LittleEmperorsError("Le client n’a pas un prénom et un nom.", 422, "guest_name");
  }
  const email = String(customer.email || "").trim();
  if (!email) throw new LittleEmperorsError("Le client n’a pas d’e-mail.", 422, "guest_email");
  const loyalty = loyaltyFromCustomer(customer);
  const program = input.loyaltyProgram === "bonvoy" || input.loyaltyProgram === "all_accor" ? input.loyaltyProgram : null;
  const loyaltyNumber = program ? loyalty[program] || null : null;
  const created = await createLittleEmperorsBooking({
    start_date: input.start,
    end_date: input.end,
    session_id: input.sessionId,
    rate_index: input.rateIndex,
    hotel_id: input.hotelId,
    guest_name: guest,
    guest_email: email,
    eta: input.eta || null,
    loyalty_number: loyaltyNumber,
    rooms: [{ adults: input.adults, children: input.childrenAges.map((age) => ({ age })), guest_name: guest }],
  });
  let booking = created;
  if (booking.hotel_id != null) {
    try {
      booking = applyHotelPublicFields(booking, await fetchLittleEmperorsHotel(booking.hotel_id));
    } catch {
      booking = created;
    }
  }
  const { data: existing } = await admin
    .from("crm_le_bookings")
    .select("id, crm_booking_id, status")
    .eq("le_booking_id", booking.id)
    .maybeSingle();
  const context = await loadMatchContext(admin);
  const placed = await placeLeBooking(
    admin,
    booking,
    {
      crm_booking_id: input.crmBookingId || existing?.crm_booking_id || null,
      status: existing?.status || null,
    },
    context
  );
  const payload = rowFromBooking(booking, {
    crm_booking_id: placed.crmBookingId,
    status: placed.crmBookingId ? "linked" : "unmatched",
    candidates: placed.candidates,
    last_event: "crm_book",
    last_error: placed.lastError,
  });
  if (existing?.id) await admin.from("crm_le_bookings").update(payload).eq("id", existing.id);
  else await admin.from("crm_le_bookings").insert(payload);
  return { bookingId: placed.crmBookingId, leBookingId: booking.id };
}
