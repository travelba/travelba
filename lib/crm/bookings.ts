import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_ITEM_LABELS,
  isExtraItemKind,
  type BookingItemKind,
  type BookingStatus,
  type CrmBooking,
  type CrmBookingItem,
  type CrmTransaction,
} from "@/lib/crm/types";
import { itemTicketCount } from "@/lib/crm/item-match";
import { hotelDisplayName } from "@/lib/crm/carnet";
import {
  ticketingFeeAmount,
  ticketingFeeExternalId,
  ticketingFeeLabel,
  ticketingTicketCount,
} from "@/lib/crm/ticketing-fee";

export function parseIncludeInLedger(value: unknown, fallback: boolean) {
  if (value === true || value === "on" || value === "true") return true;
  if (value === false || value === "off" || value === "false") return false;
  return fallback;
}

export function bookingDebitIntent(input: {
  status: BookingStatus;
  amount: number;
  hasOpenDebit: boolean;
  includeInLedger?: boolean;
}): "insert" | "update" | "void" | "noop" {
  if (input.status === "cancelled") return input.hasOpenDebit ? "void" : "noop";
  if (input.includeInLedger === false) return input.hasOpenDebit ? "void" : "noop";
  const shouldDebit =
    input.status === "confirmed" ||
    input.status === "travelling" ||
    input.status === "completed";
  if (!shouldDebit) return "noop";
  if (!input.hasOpenDebit) return input.amount > 0 ? "insert" : "noop";
  if (input.amount <= 0) return "void";
  return "update";
}

/** Prix vendu d’une carte : vol = unitaire × billets, sinon amount. */
export function itemSellingAmount(item: {
  kind?: string | null;
  amount?: number | null;
  details?: Record<string, unknown> | null;
}): number | null {
  const unit = Number(item.amount);
  if (!Number.isFinite(unit) || unit <= 0) return null;
  const total = unit * itemTicketCount(item);
  return Math.round(total * 100) / 100;
}

export function bookingTotalFromItems(
  items: { kind?: string | null; amount?: number | null; details?: Record<string, unknown> | null }[]
): number | null {
  let sum = 0;
  let priced = false;
  for (const item of items) {
    if (isExtraItemKind(item.kind)) continue;
    const n = itemSellingAmount(item);
    if (n == null) continue;
    sum += n;
    priced = true;
  }
  if (!priced) return null;
  return Math.round(sum * 100) / 100;
}

export async function syncBookingTotalFromItems(supabase: SupabaseClient, bookingId: string) {
  const { data: items } = await supabase
    .from("crm_booking_items")
    .select("amount, kind, details")
    .eq("booking_id", bookingId);
  const total = bookingTotalFromItems(items || []);
  if (total == null) return;
  await supabase.from("crm_bookings").update({ total_amount: total }).eq("id", bookingId);
}

export function bookingItemDebitExternalId(bookingId: string, itemId: string) {
  return `booking:${bookingId}:item:${itemId}`;
}

export function bookingItemDebitLabel(
  item: Pick<CrmBookingItem, "kind" | "title"> & { details?: Record<string, unknown> | null },
  reference: string
) {
  const kind = BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind;
  const title =
    item.kind === "hotel" ? hotelDisplayName(item as CrmBookingItem) : item.title;
  return `${kind} · ${title} — ${reference}`;
}

export async function nextBookingReference(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("crm_next_booking_reference");
  if (error || !data) {
    console.error("[bookings] reference:", error?.code ?? "?", error?.message ?? "");
    throw new Error("Référence de dossier indisponible. Réessayez.");
  }
  return String(data);
}

export async function syncBookingDebit(
  supabase: SupabaseClient,
  booking: CrmBooking,
  previousStatus?: BookingStatus
) {
  const { data: existing } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("kind", "booking")
    .eq("direction", "debit")
    .is("external_id", null)
    .neq("status", "void")
    .maybeSingle();

  const debit = existing as CrmTransaction | null;
  const amount = Number(booking.total_amount || 0);
  const intent = bookingDebitIntent({
    status: booking.status,
    amount,
    hasOpenDebit: Boolean(debit),
    includeInLedger: booking.include_in_ledger !== false,
  });
  const label = `Réservation ${booking.reference} — ${booking.title}`;

  if (intent === "void" && debit) {
    await supabase
      .from("crm_transactions")
      .update({ status: "void" })
      .eq("id", debit.id);
    return;
  }

  if (intent === "insert") {
    await supabase.from("crm_transactions").insert({
      customer_id: booking.billing_customer_id || booking.customer_id,
      booking_id: booking.id,
      direction: "debit",
      kind: "booking",
      amount,
      currency: booking.currency || "EUR",
      label,
      source: "manual",
      status: "posted",
    });
    return;
  }

  if (intent !== "update" || !debit) return;

  const payerId = booking.billing_customer_id || booking.customer_id;
  const amountChanged = Number(debit.amount) !== amount;
  const statusChanged = Boolean(previousStatus && previousStatus !== booking.status);
  const payerChanged = debit.customer_id !== payerId;
  if (amountChanged || statusChanged || payerChanged || debit.status !== "posted") {
    await supabase
      .from("crm_transactions")
      .update({
        customer_id: payerId,
        amount,
        currency: booking.currency || "EUR",
        label,
        status: "posted",
      })
      .eq("id", debit.id);
  }
}

export async function syncTicketingFee(supabase: SupabaseClient, booking: CrmBooking) {
  const [{ data: items }, { data: travelers }, { data: existing }] = await Promise.all([
    supabase.from("crm_booking_items").select("kind").eq("booking_id", booking.id),
    supabase.from("crm_booking_travelers").select("id").eq("booking_id", booking.id),
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("source", "manual")
      .eq("external_id", ticketingFeeExternalId(booking.id))
      .maybeSingle(),
  ]);

  const hasFlight = (items || []).some((row) => row.kind === "flight");
  const travelerCount = (travelers || []).length;
  const ticketCount = ticketingTicketCount({ hasFlight, travelerCount });
  const amount = ticketingFeeAmount({ hasFlight, travelerCount });
  const shouldPost =
    (booking.status === "confirmed" ||
      booking.status === "travelling" ||
      booking.status === "completed") &&
    amount > 0;
  const label = ticketingFeeLabel(ticketCount);
  const debit = existing as CrmTransaction | null;
  const payerId = booking.billing_customer_id || booking.customer_id;

  if (!shouldPost) {
    if (debit && debit.status !== "void") {
      await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id);
    }
    return;
  }

  if (!debit) {
    await supabase.from("crm_transactions").insert({
      customer_id: payerId,
      booking_id: booking.id,
      direction: "debit",
      kind: "adjustment",
      amount,
      currency: booking.currency || "EUR",
      label,
      source: "manual",
      external_id: ticketingFeeExternalId(booking.id),
      status: "posted",
    });
    return;
  }

  await supabase
    .from("crm_transactions")
    .update({
      customer_id: payerId,
      amount,
      currency: booking.currency || "EUR",
      label,
      status: "posted",
    })
    .eq("id", debit.id);
}

export async function syncBookingItemDebits(supabase: SupabaseClient, booking: CrmBooking) {
  const { data: items } = await supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", booking.id);
  const rows = (items || []) as CrmBookingItem[];
  const prefix = `booking:${booking.id}:item:`;
  const { data: existingRows } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("source", "manual")
    .eq("kind", "booking")
    .eq("direction", "debit");
  const byExternal = new Map<string, CrmTransaction>();
  for (const row of (existingRows || []) as CrmTransaction[]) {
    if ((row.external_id || "").startsWith(prefix)) {
      byExternal.set(row.external_id as string, row);
    }
  }

  const billedIds = new Set<string>();
  const payerId = booking.billing_customer_id || booking.customer_id;

  for (const item of rows) {
    const amount = itemSellingAmount(item) || 0;
    const externalId = bookingItemDebitExternalId(booking.id, item.id);
    billedIds.add(item.id);
    const debit = byExternal.get(externalId) || null;
    // A voided line still occupies unique(source, external_id) — update it, don't insert.
    const intent = bookingDebitIntent({
      status: booking.status,
      amount,
      hasOpenDebit: Boolean(debit),
      includeInLedger: Boolean(item.include_in_ledger),
    });
    const label = bookingItemDebitLabel(item, booking.reference);

    if (intent === "void" && debit && debit.status !== "void") {
      const { error } = await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id);
      if (error) throw new Error(error.message);
      continue;
    }
    if (intent === "insert") {
      const { error } = await supabase.from("crm_transactions").insert({
        customer_id: payerId,
        booking_id: booking.id,
        direction: "debit",
        kind: "booking",
        amount,
        currency: booking.currency || "EUR",
        label,
        source: "manual",
        external_id: externalId,
        status: "posted",
      });
      if (error) throw new Error(error.message);
      continue;
    }
    if (intent !== "update" || !debit) continue;
    const { error } = await supabase
      .from("crm_transactions")
      .update({
        customer_id: payerId,
        amount,
        currency: booking.currency || "EUR",
        label,
        status: "posted",
      })
      .eq("id", debit.id);
    if (error) throw new Error(error.message);
  }

  for (const [externalId, debit] of byExternal) {
    const itemId = externalId.slice(prefix.length);
    if (billedIds.has(itemId)) continue;
    if (debit.status === "void") continue;
    await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id);
  }
}

export async function syncBookingLedger(
  supabase: SupabaseClient,
  booking: CrmBooking,
  previousStatus?: BookingStatus
) {
  await syncBookingDebit(supabase, booking, previousStatus);
  await syncBookingItemDebits(supabase, booking);
  await syncTicketingFee(supabase, booking);
}

export async function refreshBookingLedger(supabase: SupabaseClient, bookingId: string) {
  await syncBookingTotalFromItems(supabase, bookingId);
  const { data } = await supabase.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!data) return;
  await syncBookingLedger(supabase, data as CrmBooking);
}

export async function refreshTicketingFee(supabase: SupabaseClient, bookingId: string) {
  await refreshBookingLedger(supabase, bookingId);
}

export function canPublishCarnet(items: { kind: string }[]) {
  return items.some((item) => item.kind !== "fee" && !isExtraItemKind(item.kind));
}

export async function setCarnetPublished(
  supabase: SupabaseClient,
  bookingId: string,
  visible: boolean
) {
  if (visible) {
    const { data: items, error: itemsLookupError } = await supabase
      .from("crm_booking_items")
      .select("kind")
      .eq("booking_id", bookingId);
    if (itemsLookupError) throw new Error(itemsLookupError.message);
    if (!canPublishCarnet(items || [])) {
      throw new Error(
        "Ajoutez au moins une carte (vol, hôtel, transfert…) avant de publier le carnet."
      );
    }
  }
  const { error: bookingError } = await supabase
    .from("crm_bookings")
    .update({ visible_to_client: visible })
    .eq("id", bookingId);
  if (bookingError) throw new Error(bookingError.message);
  if (!visible) return;
  const { error: itemsError } = await supabase
    .from("crm_booking_items")
    .update({ visible_to_client: true })
    .eq("booking_id", bookingId);
  if (itemsError) throw new Error(itemsError.message);
  const { error: docsError } = await supabase
    .from("crm_booking_documents")
    .update({ visible_to_client: true })
    .eq("booking_id", bookingId);
  if (docsError) throw new Error(docsError.message);
}

