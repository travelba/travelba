import { deleteBookingById } from "@/lib/crm/delete-booking";
import { cancellationApplyPlan, confirmationRefsAlign, referenceTokens } from "@/lib/crm/email-match";
import { applyCancellationToBooking, persistNewBookingFromExtract } from "@/lib/crm/ingest-booking";
import { hotelBookingStem } from "@/lib/crm/item-match";
import { persistLittleEmperorsHotelContacts } from "@/lib/crm/le-hotel-contacts";
import {
  decideLittleEmperorsAuto,
  leBookingExtract,
  leItemsForHotelStamp,
  suggestLittleEmperorsBooking,
  type LeAutoDecision,
} from "@/lib/crm/little-emperors-match";
import {
  applyHotelPublicFields,
  cancelLittleEmperorsBooking,
  fetchLittleEmperorsHotel,
  benefitsFromLeRaw,
  isLeCancelled,
  listLittleEmperorsBookings,
  LittleEmperorsError,
  type LeBooking,
} from "@/lib/crm/little-emperors";
import type { LeHotelCatalog } from "@/lib/crm/hotel-contact";
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

export type LeSyncResult = {
  ok: boolean;
  fetched: number;
  linked: number;
  created: number;
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

/** Un seul dossier ouvert porte cette confirmation. Plusieurs : on ne crée pas. */
async function findUniqueDossierByConfirmation(admin: SupabaseClient, confirmation: string | null) {
  const stem = hotelBookingStem(confirmation);
  const needles = [
    ...new Set(
      [...referenceTokens(confirmation), ...(stem ? [stem.toLowerCase()] : [])].map((token) =>
        token.replace(/[%_]/g, "")
      )
    ),
  ].filter((token) => token.length >= 4);
  if (!needles.length) return null;
  const { data } = await admin
    .from("crm_booking_items")
    .select("booking_id, confirmation_ref")
    .eq("kind", "hotel")
    .or(needles.map((token) => `confirmation_ref.ilike.%${token}%`).join(","))
    .limit(30);
  const ids = new Set<string>();
  for (const row of data || []) {
    if (!confirmationRefsAlign(row.confirmation_ref, confirmation)) continue;
    if (row.booking_id) ids.add(row.booking_id);
  }
  if (!ids.size) return null;
  const { data: dossiers } = await admin
    .from("crm_bookings")
    .select("id, status, archived_at")
    .in("id", [...ids]);
  const open = (dossiers || []).filter((row) => row.status !== "cancelled" && !row.archived_at);
  if (open.length === 1) return open[0].id as string;
  if (open.length > 1) return "many" as const;
  return null;
}

async function saveLeRow(
  admin: SupabaseClient,
  leBookingId: number,
  existingId: string | undefined,
  payload: Record<string, unknown>
) {
  if (existingId) {
    const linkedId = (payload.crm_booking_id as string | null) || null;
    if (linkedId) {
      await admin.from("crm_le_bookings").update(payload).eq("id", existingId);
      return { id: existingId, crmBookingId: linkedId };
    }
    const rest = { ...payload };
    delete rest.crm_booking_id;
    await admin.from("crm_le_bookings").update(rest).eq("id", existingId);
    const { data } = await admin
      .from("crm_le_bookings")
      .select("crm_booking_id")
      .eq("id", existingId)
      .maybeSingle();
    return { id: existingId, crmBookingId: (data?.crm_booking_id as string | null) || null };
  }
  const { data: inserted } = await admin.from("crm_le_bookings").insert(payload).select("id").maybeSingle();
  if (inserted?.id) return { id: inserted.id as string, crmBookingId: (payload.crm_booking_id as string | null) || null };
  const { data: again } = await admin
    .from("crm_le_bookings")
    .select("id, crm_booking_id")
    .eq("le_booking_id", leBookingId)
    .maybeSingle();
  return {
    id: (again?.id as string | undefined) || null,
    crmBookingId: (again?.crm_booking_id as string | null) || null,
  };
}

async function stampLeStay(admin: SupabaseClient, crmBookingId: string, booking: LeBooking) {
  const { data: items } = await admin
    .from("crm_booking_items")
    .select("id, title, confirmation_ref, details")
    .eq("booking_id", crmBookingId)
    .eq("kind", "hotel");
  const ids = new Set(leItemsForHotelStamp(items || [], booking));
  for (const item of items || []) {
    if (!ids.has(item.id)) continue;
    const details = { ...(item.details || {}) } as Record<string, unknown>;
    if (booking.hotel_id != null && details.le_hotel_id == null) details.le_hotel_id = booking.hotel_id;
    if (!details.source_family) details.source_family = "little_emperors";
    await admin.from("crm_booking_items").update({ details }).eq("id", item.id);
  }
}

async function ensureLeDossier(opts: {
  admin: SupabaseClient;
  rowId: string;
  booking: LeBooking;
  decision: LeAutoDecision;
}) {
  if (opts.decision.kind !== "create") {
    return { crmBookingId: null as string | null, created: false, lastError: null as string | null };
  }
  const found = await findUniqueDossierByConfirmation(opts.admin, opts.booking.confirmation_number);
  if (found === "many") return { crmBookingId: null, created: false, lastError: null };
  if (found) return { crmBookingId: found, created: false, lastError: null };
  try {
    const result = await attachLittleEmperorsBooking({
      id: opts.rowId,
      customerId: opts.decision.customerId,
    });
    return { crmBookingId: result.bookingId as string, created: !result.already, lastError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Création du dossier impossible.";
    return { crmBookingId: null, created: false, lastError: message };
  }
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
    return { ok: false, fetched: 0, linked: 0, created: 0, cancelled: 0, message, status, code };
  }

  const context = await loadMatchContext(admin);
  const rememberHotel = hotelCatalogCache(admin, fetchImpl);
  let linked = 0;
  let created = 0;
  let cancelled = 0;
  for (const booking of fetched) {
    const { data: existing } = await admin
      .from("crm_le_bookings")
      .select("id, crm_booking_id, status")
      .eq("le_booking_id", booking.id)
      .maybeSingle();
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
    const decision = decideLittleEmperorsAuto({
      booking,
      suggestion,
      customers: context.customers,
      linkedBookingId: existing?.crm_booking_id,
      ignored: existing?.status === "ignored",
    });
    let crmBookingId = decision.kind === "link" ? decision.bookingId : null;
    const cancelledRemote = isLeCancelled(booking.state);
    let lastError: string | null = null;
    if (cancelledRemote && crmBookingId) {
      const result = await reflectCancellation(admin, crmBookingId, booking);
      if (result === "cancelled") cancelled += 1;
      if (result === "unmatched_card") {
        lastError = "Annulation Little Emperors reçue, sans carte hôtel correspondante sur le dossier.";
      }
    }
    let status: "linked" | "unmatched" | "ignored" = crmBookingId
      ? "linked"
      : existing?.status === "ignored"
        ? "ignored"
        : "unmatched";
    if (crmBookingId && !existing?.crm_booking_id) linked += 1;
    const catalog = booking.hotel_id != null ? await rememberHotel(booking.hotel_id, null) : null;
    const payload = rowFromBooking(booking, {
      crm_booking_id: crmBookingId,
      status,
      candidates,
      last_event: cancelledRemote ? "hotel_booking_cancel" : "sync",
      last_error: lastError,
      ...(catalog?.country ? { country: catalog.country } : {}),
      ...(catalog?.website && !booking.website ? { website: catalog.website } : {}),
    });
    const saved = await saveLeRow(admin, booking.id, existing?.id, payload);
    const rowId = saved.id;
    if (saved.crmBookingId && !crmBookingId) crmBookingId = saved.crmBookingId;
    if (decision.kind === "create" && rowId && !crmBookingId) {
      const outcome = await ensureLeDossier({ admin, rowId, booking, decision });
      if (outcome.created) created += 1;
      else if (outcome.crmBookingId) linked += 1;
      crmBookingId = outcome.crmBookingId;
      if (outcome.lastError) lastError = outcome.lastError;
      if (crmBookingId) status = "linked";
      if (crmBookingId || outcome.lastError) {
        await admin
          .from("crm_le_bookings")
          .update({
            crm_booking_id: crmBookingId,
            status: crmBookingId ? "linked" : status,
            last_error: lastError,
          })
          .eq("id", rowId);
      }
    }
    if (crmBookingId && booking.hotel_id != null) {
      await stampLeStay(admin, crmBookingId, booking);
      await rememberHotel(booking.hotel_id, crmBookingId);
    }
  }
  await rememberProbe(admin, {
    last_status: 200,
    last_error: null,
    last_ok_at: new Date().toISOString(),
  });
  return { ok: true, fetched: fetched.length, linked, created, cancelled };
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
  const suggestion = suggestLittleEmperorsBooking(
    merged,
    context.bookings,
    context.itemsByBooking,
    context.customers
  );
  const decision = decideLittleEmperorsAuto({
    booking: merged,
    suggestion,
    customers: context.customers,
    linkedBookingId: existing?.crm_booking_id,
    ignored: existing?.status === "ignored",
  });
  let crmBookingId = decision.kind === "link" ? decision.bookingId : null;
  let lastError: string | null = null;
  let cancelled = 0;
  if (cancelledRemote && crmBookingId) {
    const result = await reflectCancellation(admin, crmBookingId, merged);
    if (result === "cancelled") cancelled = 1;
    if (result === "unmatched_card") {
      lastError = "Annulation Little Emperors reçue, sans carte hôtel correspondante sur le dossier.";
    }
  } else if (cancelledRemote && !crmBookingId) {
    lastError = null;
  }
  const candidates = suggestion.candidates
    .filter((row) => row.customer_id)
    .map((row) => ({
      customer_id: row.customer_id as string,
      booking_id: row.booking_id,
      label: row.label,
      reason: row.reason,
      score: row.score,
    }));
  const payload = rowFromBooking(merged, {
    crm_booking_id: crmBookingId,
    status: crmBookingId ? "linked" : existing?.status === "ignored" ? "ignored" : "unmatched",
    candidates,
    last_event: event,
    last_error: lastError,
    ...(catalog?.country ? { country: catalog.country } : {}),
  });
  const saved = await saveLeRow(admin, merged.id, existing?.id, payload);
  const rowId = saved.id;
  if (saved.crmBookingId && !crmBookingId) crmBookingId = saved.crmBookingId;
  if (decision.kind === "create" && rowId && !crmBookingId) {
    const outcome = await ensureLeDossier({ admin, rowId, booking: merged, decision });
    crmBookingId = outcome.crmBookingId;
    if (outcome.lastError) lastError = outcome.lastError;
    if (crmBookingId || outcome.lastError) {
      await admin
        .from("crm_le_bookings")
        .update({
          crm_booking_id: crmBookingId,
          status: crmBookingId ? "linked" : existing?.status === "ignored" ? "ignored" : "unmatched",
          last_error: lastError,
        })
        .eq("id", rowId);
    }
  }
  if (crmBookingId && booking.hotel_id != null) {
    await stampLeStay(admin, crmBookingId, merged);
    await persistLittleEmperorsHotelContacts({
      hotelId: booking.hotel_id,
      catalog,
      crmBookingId,
      admin,
    });
  }
  return { cancelled, created: !existing };
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
  const booking: LeBooking = {
    id: Number(row.le_booking_id),
    hotel_id: row.hotel_id,
    hotel_name: row.hotel_name,
    city: row.city,
    address: row.address,
    website: row.website,
    check_in: row.check_in,
    check_out: row.check_out,
    state: row.state,
    confirmation_number: row.confirmation_number,
    total_cost: row.total_cost,
    currency: row.currency,
    is_cancellable: row.is_cancellable,
    cancellation_deadline: row.cancellation_deadline,
    guest_names: row.guest_names || [],
    cancellation_policies: row.cancellation_policies || [],
    room_types: row.room_types || [],
    benefits: benefitsFromLeRaw(row.raw),
  };
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
      status: "draft",
      visible_to_client: false,
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
  const { data: claimed } = await admin
    .from("crm_le_bookings")
    .update({ crm_booking_id: created.id, status: "linked", last_error: null })
    .eq("id", row.id)
    .is("crm_booking_id", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    try {
      await deleteBookingById(created.id);
    } catch {
      // Le dossier gagnant reste. Celui-ci sera repris au prochain passage s’il survit.
    }
    const { data: winner } = await admin
      .from("crm_le_bookings")
      .select("crm_booking_id")
      .eq("id", row.id)
      .maybeSingle();
    return { bookingId: (winner?.crm_booking_id as string) || created.id, already: true };
  }
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
  const booking: LeBooking = {
    id: Number(row.le_booking_id),
    hotel_id: row.hotel_id,
    hotel_name: row.hotel_name,
    city: row.city,
    address: row.address,
    website: row.website,
    check_in: row.check_in,
    check_out: row.check_out,
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
