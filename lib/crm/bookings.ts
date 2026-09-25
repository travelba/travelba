import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_ITEM_LABELS,
  countsAsCarnetCard,
  visibleServiceCopy,
  isExtraItemKind,
  isLedgerExpenseKind,
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
import { coversStayRollup, isStayRollupDebit } from "@/lib/crm/ledger-display";
import { debitBillingCompanyId } from "@/lib/crm/billing-companies";
import { emptyToNull } from "@/lib/crm/identity";

export function parseIncludeInLedger(value: unknown, fallback: boolean) {
  if (value === true || value === "on" || value === "true") return true;
  if (value === false || value === "off" || value === "false") return false;
  return fallback;
}

const BOOKING_META_KEYS = [
  "title",
  "destination",
  "status",
  "start_date",
  "end_date",
  "currency",
  "notes_client",
  "notes_internal",
  "customer_id",
  "billing_customer_id",
  "billing_company_id",
  "include_in_ledger",
] as const;

/** Champs dossier envoyés par le formulaire admin. Dates vides = null, titre trimé. */
export function bookingMetaPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of BOOKING_META_KEYS) {
    if (!(key in body)) continue;
    if (key === "include_in_ledger") {
      patch[key] = parseIncludeInLedger(body[key], true);
      continue;
    }
    if (key === "billing_company_id") {
      patch[key] = emptyToNull(body[key]);
      continue;
    }
    if (key === "title") {
      patch[key] = String(body[key] ?? "").trim();
      continue;
    }
    if (key === "start_date" || key === "end_date") {
      const value = String(body[key] ?? "").trim();
      patch[key] = value || null;
      continue;
    }
    patch[key] = body[key];
  }
  return patch;
}

export function bookingDebitIntent(input: {
  status: BookingStatus;
  amount: number;
  hasOpenDebit: boolean;
  includeInLedger?: boolean;
}): "insert" | "update" | "void" | "clear" | "noop" {
  if (input.status === "cancelled") return "clear";
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

/** Montant du séjour : toujours la somme des prix vendus. Transfert, greeter, enregistrement, visa, dépense libre et frais de billeterie restent hors total. */
export function bookingTotalFromItems(
  items: { kind?: string | null; amount?: number | null; details?: Record<string, unknown> | null }[]
): number {
  let sum = 0;
  for (const item of items) {
    if (isExtraItemKind(item.kind) || isLedgerExpenseKind(item.kind)) continue;
    const n = itemSellingAmount(item);
    if (n == null) continue;
    sum += n;
  }
  return Math.round(sum * 100) / 100;
}

export async function syncBookingTotalFromItems(supabase: SupabaseClient, bookingId: string) {
  const { data: items } = await supabase
    .from("crm_booking_items")
    .select("amount, kind, details")
    .eq("booking_id", bookingId);
  const total = bookingTotalFromItems(items || []);
  await supabase.from("crm_bookings").update({ total_amount: total }).eq("id", bookingId);
}

export function bookingItemDebitExternalId(bookingId: string, itemId: string) {
  return `booking:${bookingId}:item:${itemId}`;
}

/** Dépense libre : ne couvre pas le montant global du séjour. */
export function bookingExpenseDebitExternalId(bookingId: string, itemId: string) {
  return `booking:${bookingId}:expense:${itemId}`;
}

export function bookingChargeExternalId(
  bookingId: string,
  item: { id: string; kind?: string | null }
) {
  return isLedgerExpenseKind(item.kind)
    ? bookingExpenseDebitExternalId(bookingId, item.id)
    : bookingItemDebitExternalId(bookingId, item.id);
}

export function bookingItemDebitLabel(
  item: Pick<CrmBookingItem, "kind" | "title"> & { details?: Record<string, unknown> | null },
  reference: string
) {
  const kind = visibleServiceCopy(BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind);
  const title = visibleServiceCopy(
    item.kind === "hotel" ? hotelDisplayName(item as CrmBookingItem) : item.title
  );
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

/** Retire uniquement les débits rattachés au dossier. Les crédits (Revolut, virements) restent. */
export async function clearBookingCharges(supabase: SupabaseClient, bookingId: string) {
  const { error } = await supabase
    .from("crm_transactions")
    .delete()
    .eq("booking_id", bookingId)
    .eq("direction", "debit");
  if (error) throw new Error(error.message);
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

  if (intent === "clear") {
    await clearBookingCharges(supabase, booking.id);
    return;
  }

  if (intent === "void" && debit) {
    await supabase
      .from("crm_transactions")
      .update({ status: "void" })
      .eq("id", debit.id);
    return;
  }

  const companyId = debitBillingCompanyId(booking);

  if (intent === "insert") {
    await supabase.from("crm_transactions").insert({
      customer_id: booking.billing_customer_id || booking.customer_id,
      booking_id: booking.id,
      billing_company_id: companyId,
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
  const labelChanged = (debit.label || "") !== label;
  const companyChanged = (debit.billing_company_id || null) !== companyId;
  if (amountChanged || statusChanged || payerChanged || labelChanged || companyChanged || debit.status !== "posted") {
    await supabase
      .from("crm_transactions")
      .update({
        customer_id: payerId,
        billing_company_id: companyId,
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
  const companyId = debitBillingCompanyId(booking);

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
      billing_company_id: companyId,
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
      billing_company_id: companyId,
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
  const itemPrefix = `booking:${booking.id}:item:`;
  const expensePrefix = `booking:${booking.id}:expense:`;
  const { data: existingRows } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("source", "manual")
    .eq("kind", "booking")
    .eq("direction", "debit");
  const byExternal = new Map<string, CrmTransaction>();
  for (const row of (existingRows || []) as CrmTransaction[]) {
    const externalId = row.external_id || "";
    if (externalId.startsWith(itemPrefix) || externalId.startsWith(expensePrefix)) {
      byExternal.set(externalId, row);
    }
  }

  const billed = new Set<string>();
  const payerId = booking.billing_customer_id || booking.customer_id;

  for (const item of rows) {
    const amount = itemSellingAmount(item) || 0;
    const externalId = bookingChargeExternalId(booking.id, item);
    billed.add(externalId);
    const debit = byExternal.get(externalId) || null;
    // A voided line still occupies unique(source, external_id) — update it, don't insert.
    const intent = bookingDebitIntent({
      status: booking.status,
      amount,
      hasOpenDebit: Boolean(debit),
      includeInLedger: isLedgerExpenseKind(item.kind) || Boolean(item.include_in_ledger),
    });
    const label = bookingItemDebitLabel(item, booking.reference);
    const companyId = debitBillingCompanyId(booking, item);

    if (intent === "void" && debit && debit.status !== "void") {
      const { error } = await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id);
      if (error) throw new Error(error.message);
      continue;
    }
    if (intent === "insert") {
      const { error } = await supabase.from("crm_transactions").insert({
        customer_id: payerId,
        booking_id: booking.id,
        billing_company_id: companyId,
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
        billing_company_id: companyId,
        amount,
        currency: booking.currency || "EUR",
        label,
        status: "posted",
      })
      .eq("id", debit.id);
    if (error) throw new Error(error.message);
  }

  for (const [externalId, debit] of byExternal) {
    if (billed.has(externalId)) continue;
    if (debit.status === "void") continue;
    await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id);
  }
}

/** Le montant global du séjour quitte le livre dès qu’une carte ou un frais du dossier est posté. Une dépense libre ne le retire pas. */
export async function dropCoveredStayRollup(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase
    .from("crm_transactions")
    .select("id, direction, kind, external_id, status")
    .eq("booking_id", bookingId)
    .eq("direction", "debit")
    .eq("status", "posted");
  if (error) throw new Error(error.message);
  const rows = (data || []) as Pick<CrmTransaction, "id" | "direction" | "kind" | "external_id" | "status">[];
  if (!rows.some((row) => coversStayRollup({ ...row, booking_id: bookingId }))) return;
  const rollupIds = rows.filter((row) => isStayRollupDebit(row)).map((row) => row.id);
  if (!rollupIds.length) return;
  const { error: deleteError } = await supabase.from("crm_transactions").delete().in("id", rollupIds);
  if (deleteError) throw new Error(deleteError.message);
}

export async function syncBookingLedger(
  supabase: SupabaseClient,
  booking: CrmBooking,
  previousStatus?: BookingStatus
) {
  await syncBookingDebit(supabase, booking, previousStatus);
  await syncBookingItemDebits(supabase, booking);
  await syncTicketingFee(supabase, booking);
  await dropCoveredStayRollup(supabase, booking.id);
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
  return items.some((item) => countsAsCarnetCard(item.kind));
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
    .update({ visible_to_client: visible, prices_visible: visible })
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

