import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGENCY_FEE_LABEL,
  BOOKING_ITEM_LABELS,
  countsAsCarnetCard,
  visibleServiceCopy,
  isActiveItem,
  isExtraItemKind,
  isLedgerExpenseKind,
  type BookingItemKind,
  type BookingStatus,
  type CrmBooking,
  type CrmBookingItem,
  type CrmTransaction,
} from "@/lib/crm/types";
import { itemTicketCount } from "@/lib/crm/item-match";
import { hotelDisplayName, publishRevealIds } from "@/lib/crm/carnet";
import { stayTitleFromItems } from "@/lib/crm/staff-stay";
import {
  ticketingFeeAmount,
  ticketingFeeExternalId,
  ticketingFeeLabel,
  ticketingTicketCount,
} from "@/lib/crm/ticketing-fee";
import { coversStayRollup, isStayRollupDebit } from "@/lib/crm/ledger-display";
import { debitBillingCompanyId } from "@/lib/crm/billing-companies";
import { emptyToNull } from "@/lib/crm/identity";
import { stayCurrency } from "@/lib/crm/stay-currency";
import { agencyFeeBaseAmount, agencyFeeFromGross } from "@/lib/crm/money";
import { must } from "@/lib/crm/must";
import { visibilityOnRequest } from "@/lib/crm/visa-flow";

export function parseIncludeInLedger(value: unknown, fallback: boolean) {
  if (value === true || value === "on" || value === "true") return true;
  if (value === false || value === "off" || value === "false") return false;
  return fallback;
}

/**
 * Après un enregistrement réussi, une écriture du grand livre refusée devient un avertissement
 * (`ledger_warning`) plutôt qu’une erreur : la route répond 200 et un second clic ne duplique rien.
 */
export async function ledgerWarning(saved: string, run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "écriture refusée";
    console.error("[crm] grand livre:", message);
    return `${saved}, mais le grand livre n’a pas pu être mis à jour : ${message}`;
  }
}

export const MAX_SORT_ORDER = 10000;

/** Rang d’une carte : entier de 0 à 10000, sinon null. */
export function parseSortOrder(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > MAX_SORT_ORDER) return null;
  return n;
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
  "payer_kind",
  "fees_follow_stay",
  "include_in_ledger",
  "agency_commission",
  "client_settles_stay",
  "offer_chauffeur",
  "offer_greeter",
  "offer_checkin",
  "offer_visa",
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
    if (key === "fees_follow_stay") {
      patch[key] = parseIncludeInLedger(body[key], true);
      continue;
    }
    if (
      key === "agency_commission" ||
      key === "client_settles_stay" ||
      key === "offer_chauffeur" ||
      key === "offer_greeter" ||
      key === "offer_checkin" ||
      key === "offer_visa"
    ) {
      patch[key] = parseIncludeInLedger(body[key], false);
      continue;
    }
    if (key === "billing_company_id") {
      patch[key] = emptyToNull(body[key]);
      continue;
    }
    if (key === "payer_kind") {
      const kind = body[key];
      if (kind === "company" || kind === "personal") patch[key] = kind;
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
    if (key === "currency") {
      patch[key] = stayCurrency(body[key]);
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
  /** Absent = déjà montré. false = le séjour reste caché, aucun débit. */
  visibleToClient?: boolean | null;
}): "insert" | "update" | "void" | "clear" | "noop" {
  if (input.status === "cancelled") return "clear";
  if (input.includeInLedger === false) return input.hasOpenDebit ? "void" : "noop";
  const shown = input.visibleToClient !== false;
  const shouldDebit =
    shown &&
    (input.status === "confirmed" ||
      input.status === "travelling" ||
      input.status === "completed");
  if (!shouldDebit) return input.hasOpenDebit ? "void" : "noop";
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

function flightAirport(
  item: { details?: Record<string, unknown> | null },
  key: "from" | "to"
) {
  const value = item.details?.[key];
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function flightsReturn(a: { details?: Record<string, unknown> | null }, b: { details?: Record<string, unknown> | null }) {
  const aFrom = flightAirport(a, "from");
  const aTo = flightAirport(a, "to");
  const bFrom = flightAirport(b, "from");
  const bTo = flightAirport(b, "to");
  return Boolean(aFrom && aTo && aFrom === bTo && aTo === bFrom);
}

/**
 * Vols dont le prix entre dans le séjour.
 * Aller-retour : le prix saisi est celui du billet complet, compté une fois.
 * Aller simple : le prix est celui de ce vol.
 */
export function flightsInStayTotal<T extends {
  kind?: string | null;
  amount?: number | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
}>(items: T[]): T[] {
  const flights = items.filter((item) => item.kind === "flight");
  const ordered = [...flights].sort((a, b) => String(a.start_at || "").localeCompare(String(b.start_at || "")));
  const used = new Set<T>();
  const counted: T[] = [];
  for (const flight of ordered) {
    if (used.has(flight)) continue;
    const back = ordered.find((other) => other !== flight && !used.has(other) && flightsReturn(flight, other));
    const unnamedPair = !back && ordered.length === 2 && !ordered.some((row) => flightAirport(row, "from") && flightAirport(row, "to"));
    const pair = back || (unnamedPair ? ordered.find((other) => other !== flight) : null);
    if (pair) {
      used.add(flight);
      used.add(pair);
      const priced = [flight, pair].find((row) => itemSellingAmount(row) != null);
      if (priced) counted.push(priced);
      continue;
    }
    used.add(flight);
    counted.push(flight);
  }
  return counted;
}

export function flightCountsInStay<T extends {
  kind?: string | null;
  amount?: number | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
}>(item: T, items: T[]) {
  if (item.kind !== "flight") return true;
  return flightsInStayTotal(items).includes(item);
}

/** Carte dont le prix compose le montant du séjour. Hors extras et dépenses libres. */
export function isStayAmountKind(kind: string | null | undefined) {
  return !isExtraItemKind(kind) && !isLedgerExpenseKind(kind);
}

/**
 * Le montant global entre au livre, sauf si le client règle le séjour sur sa carte.
 */
export function stayIncludedInLedger(booking: {
  include_in_ledger?: boolean | null;
  client_settles_stay?: boolean | null;
}) {
  if (booking.client_settles_stay) return false;
  return booking.include_in_ledger !== false;
}

/**
 * Dépense libre : toujours. Carte du séjour : jamais si le client règle.
 * Extra (chauffeur, VIP, visa, enregistrement) : selon sa propre case.
 */
export function itemIncludedInLedger(
  item: { kind?: string | null; include_in_ledger?: boolean | null },
  clientSettlesStay: boolean
) {
  if (isLedgerExpenseKind(item.kind)) return true;
  if (clientSettlesStay && isStayAmountKind(item.kind)) return false;
  return Boolean(item.include_in_ledger);
}

/** Montant du séjour : toujours la somme des prix vendus. Transfert, greeter, enregistrement, visa, dépense libre et frais de billeterie restent hors total. */
export function bookingTotalFromItems(
  items: {
    kind?: string | null;
    amount?: number | null;
    start_at?: string | null;
    details?: Record<string, unknown> | null;
    lifecycle?: string | null;
  }[]
): number {
  let sum = 0;
  const active = items.filter((item) => isActiveItem(item));
  const fareFlights = new Set(flightsInStayTotal(active));
  for (const item of active) {
    if (!isStayAmountKind(item.kind)) continue;
    if (item.kind === "flight" && !fareFlights.has(item)) continue;
    const n = itemSellingAmount(item);
    if (n == null) continue;
    sum += n;
  }
  return Math.round(sum * 100) / 100;
}

export async function syncBookingTotalFromItems(supabase: SupabaseClient, bookingId: string) {
  const items = must(
    await supabase.from("crm_booking_items").select("amount, kind, details, start_at, lifecycle").eq("booking_id", bookingId),
    "Cartes du séjour"
  );
  const total = bookingTotalFromItems(items || []);
  must(await supabase.from("crm_bookings").update({ total_amount: total }).eq("id", bookingId), "Montant du séjour");
}

export function bookingItemDebitExternalId(bookingId: string, itemId: string) {
  return `booking:${bookingId}:item:${itemId}`;
}

/** Dépense libre : ne couvre pas le montant global du séjour. */
export function bookingExpenseDebitExternalId(bookingId: string, itemId: string) {
  return `booking:${bookingId}:expense:${itemId}`;
}

export function agencyCommissionExternalId(bookingId: string) {
  return `booking:${bookingId}:agency-commission`;
}

type AgencyFeeItem = {
  kind?: string | null;
  amount?: number | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

/** Étapes actives (séjour et extras) plus dépenses. Une étape annulée ou remplacée sort. */
export function agencyFeeBaseFromItems(items: AgencyFeeItem[]) {
  const extras: { amount: number | null }[] = [];
  const expenses: { amount: number | null }[] = [];
  for (const item of items) {
    if (!isActiveItem(item)) continue;
    const amount = itemSellingAmount(item);
    if (isExtraItemKind(item.kind)) extras.push({ amount });
    else if (isLedgerExpenseKind(item.kind)) expenses.push({ amount });
  }
  return agencyFeeBaseAmount({
    stayTotal: bookingTotalFromItems(items),
    extras,
    expenses,
  });
}

/** Montants d’extras actifs, pour le même calcul côté affichage. */
export function agencyFeeExtraAmounts(items: AgencyFeeItem[]) {
  const extras: { amount: number | null }[] = [];
  for (const item of items) {
    if (!isActiveItem(item) || !isExtraItemKind(item.kind)) continue;
    extras.push({ amount: itemSellingAmount(item) });
  }
  return extras;
}

/** 10 % de l’assiette, seulement si le voyage l’active et qu’il est au livre. */
export function agencyCommissionAmount(input: {
  enabled: boolean;
  status: BookingStatus;
  base: number;
  visibleToClient?: boolean | null;
}) {
  const active =
    input.enabled &&
    input.visibleToClient !== false &&
    (input.status === "confirmed" ||
      input.status === "travelling" ||
      input.status === "completed");
  if (!active) return 0;
  return agencyFeeFromGross(input.base);
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
  const existing = must(
    await supabase
      .from("crm_transactions")
      .select("*")
      .eq("booking_id", booking.id)
      .eq("kind", "booking")
      .eq("direction", "debit")
      .is("external_id", null)
      .neq("status", "void")
      .maybeSingle(),
    "Débit séjour"
  );

  const debit = existing as CrmTransaction | null;
  const amount = Number(booking.total_amount || 0);
  const intent = bookingDebitIntent({
    status: booking.status,
    amount,
    hasOpenDebit: Boolean(debit),
    includeInLedger: stayIncludedInLedger(booking),
    visibleToClient: booking.visible_to_client,
  });
  const label = `Réservation ${booking.reference} — ${booking.title}`;

  if (intent === "clear") {
    await clearBookingCharges(supabase, booking.id);
    return;
  }

  if (intent === "void" && debit) {
    must(await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id), "Débit séjour");
    return;
  }

  const companyId = debitBillingCompanyId(booking);

  if (intent === "insert") {
    must(
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
      }),
      "Débit séjour"
    );
    return;
  }

  if (intent !== "update" || !debit) return;

  const payerId = booking.billing_customer_id || booking.customer_id;
  const amountChanged = Number(debit.amount) !== amount;
  const statusChanged = Boolean(previousStatus && previousStatus !== booking.status);
  const payerChanged = debit.customer_id !== payerId;
  const labelChanged = (debit.label || "") !== label;
  const companyChanged = (debit.billing_company_id || null) !== companyId;
  const currencyChanged = (debit.currency || "EUR") !== (booking.currency || "EUR");
  if (
    amountChanged ||
    statusChanged ||
    payerChanged ||
    labelChanged ||
    companyChanged ||
    currencyChanged ||
    debit.status !== "posted"
  ) {
    must(
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
        .eq("id", debit.id),
      "Débit séjour"
    );
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
    booking.visible_to_client === true &&
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
      must(await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id), "Frais de billeterie");
    }
    return;
  }

  if (!debit) {
    must(
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
      }),
      "Frais de billeterie"
    );
    return;
  }

  must(
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
      .eq("id", debit.id),
    "Frais de billeterie"
  );
}

export async function syncAgencyCommission(supabase: SupabaseClient, booking: CrmBooking) {
  const itemRows = must(
    await supabase
      .from("crm_booking_items")
      .select("amount, kind, details, start_at, lifecycle")
      .eq("booking_id", booking.id),
    "Assiette des frais d’agence"
  );
  const amount = agencyCommissionAmount({
    enabled: booking.agency_commission === true,
    status: booking.status,
    base: agencyFeeBaseFromItems(itemRows || []),
    visibleToClient: booking.visible_to_client,
  });
  const externalId = agencyCommissionExternalId(booking.id);
  const { data: existing } = await supabase
    .from("crm_transactions")
    .select("*")
    .eq("source", "manual")
    .eq("external_id", externalId)
    .maybeSingle();
  const debit = existing as CrmTransaction | null;
  const payerId = booking.billing_customer_id || booking.customer_id;
  const companyId = debitBillingCompanyId(booking);

  if (amount <= 0) {
    if (debit && debit.status !== "void") {
      must(await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id), "Frais d’agence");
    }
    return;
  }

  if (!debit) {
    must(
      await supabase.from("crm_transactions").insert({
        customer_id: payerId,
        booking_id: booking.id,
        billing_company_id: companyId,
        direction: "debit",
        kind: "adjustment",
        amount,
        currency: booking.currency || "EUR",
        label: AGENCY_FEE_LABEL,
        source: "manual",
        external_id: externalId,
        status: "posted",
      }),
      "Frais d’agence"
    );
    return;
  }

  must(
    await supabase
      .from("crm_transactions")
      .update({
        customer_id: payerId,
        billing_company_id: companyId,
        amount,
        currency: booking.currency || "EUR",
        label: AGENCY_FEE_LABEL,
        status: "posted",
      })
      .eq("id", debit.id),
    "Frais d’agence"
  );
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
      includeInLedger: itemIncludedInLedger(item, booking.client_settles_stay === true),
      visibleToClient: booking.visible_to_client,
    });
    const label = bookingItemDebitLabel(item, booking.reference);
    const companyId = debitBillingCompanyId(booking, item);

    if (intent === "void" && debit && debit.status !== "void") {
      must(await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id), "Débit carte");
      continue;
    }
    if (intent === "insert") {
      must(
        await supabase.from("crm_transactions").insert({
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
        }),
        "Débit carte"
      );
      continue;
    }
    if (intent !== "update" || !debit) continue;
    must(
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
        .eq("id", debit.id),
      "Débit carte"
    );
  }

  for (const [externalId, debit] of byExternal) {
    if (billed.has(externalId)) continue;
    if (debit.status === "void") continue;
    must(await supabase.from("crm_transactions").update({ status: "void" }).eq("id", debit.id), "Débit carte retiré");
  }
}

/** Le montant global du séjour quitte le livre dès qu’une carte ou un frais du dossier est posté. Une dépense libre ou la commission 10 % ne le retire pas. */
export async function dropCoveredStayRollup(supabase: SupabaseClient, bookingId: string) {
  const data = must(
    await supabase
      .from("crm_transactions")
      .select("id, direction, kind, external_id, status, source")
      .eq("booking_id", bookingId)
      .eq("direction", "debit")
      .eq("status", "posted"),
    "Montant global du séjour"
  );
  const rows = (data || []) as Pick<CrmTransaction, "id" | "direction" | "kind" | "external_id" | "status" | "source">[];
  if (!rows.some((row) => coversStayRollup({ ...row, booking_id: bookingId }))) return;
  const rollupIds = rows.filter((row) => isStayRollupDebit(row)).map((row) => row.id);
  if (!rollupIds.length) return;
  must(await supabase.from("crm_transactions").delete().in("id", rollupIds), "Montant global du séjour");
}

export async function syncBookingLedger(
  supabase: SupabaseClient,
  booking: CrmBooking,
  previousStatus?: BookingStatus
) {
  if (booking.archived_at) {
    await clearBookingCharges(supabase, booking.id);
    return;
  }
  await syncBookingDebit(supabase, booking, previousStatus);
  await syncBookingItemDebits(supabase, booking);
  await syncTicketingFee(supabase, booking);
  await syncAgencyCommission(supabase, booking);
  await dropCoveredStayRollup(supabase, booking.id);
}

/** Le titre suit les villes des étapes, sauf un nom choisi (« 40 ans »). */
export async function syncBookingTitleFromSteps(supabase: SupabaseClient, bookingId: string) {
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("title, destination")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return "";
  const { data: items } = await supabase
    .from("crm_booking_items")
    .select("id, kind, title, start_at, end_at, sort_order, details, lifecycle")
    .eq("booking_id", bookingId);
  const next = stayTitleFromItems(
    booking.title,
    booking.destination,
    items || [],
    ""
  ).trim();
  const current = (booking.title || "").trim();
  if (!next || next === current) return current;
  const { error } = await supabase.from("crm_bookings").update({ title: next }).eq("id", bookingId);
  if (error) return current;
  return next;
}

export async function refreshBookingLedger(supabase: SupabaseClient, bookingId: string) {
  await syncBookingTotalFromItems(supabase, bookingId);
  await syncBookingTitleFromSteps(supabase, bookingId);
  const { data } = await supabase.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!data) return;
  await syncBookingLedger(supabase, data as CrmBooking);
}

export async function refreshTicketingFee(supabase: SupabaseClient, bookingId: string) {
  await refreshBookingLedger(supabase, bookingId);
}

export function canPublishCarnet(items: { kind: string; lifecycle?: string | null }[]) {
  return items.some((item) => isActiveItem(item) && countsAsCarnetCard(item.kind));
}

/**
 * Montrer / cacher le carnet. Publier révèle les cartes (`publishRevealIds`) et leurs pièces.
 * `prices` (défaut : suivre `visible`) : la formalité ouvre le séjour sans révéler des prix masqués.
 */
export async function setCarnetPublished(
  supabase: SupabaseClient,
  bookingId: string,
  visible: boolean,
  options?: { prices?: boolean }
) {
  const pricesVisible = visible ? options?.prices !== false : false;
  if (visible) {
    const { data: items, error: itemsLookupError } = await supabase
      .from("crm_booking_items")
      .select("kind")
      .eq("booking_id", bookingId);
    if (itemsLookupError) throw new Error(itemsLookupError.message);
    if (!canPublishCarnet(items || [])) {
      throw new Error(
        "Ajoutez au moins une carte (vol, hôtel, transfert…) avant de montrer le carnet."
      );
    }
  }
  const { error: bookingError } = await supabase
    .from("crm_bookings")
    .update({ visible_to_client: visible, prices_visible: pricesVisible })
    .eq("id", bookingId);
  if (bookingError) throw new Error(bookingError.message);
  if (!visible) return;
  const { data: rows, error: rowsError } = await supabase
    .from("crm_booking_items")
    .select("id, kind, details, lifecycle")
    .eq("booking_id", bookingId);
  if (rowsError) throw new Error(rowsError.message);
  const typedRows = (rows || []) as {
    id: string;
    kind: string;
    details?: Record<string, unknown> | null;
  }[];
  const revealIds = publishRevealIds(typedRows);
  const hiddenIds = new Set(typedRows.map((row) => row.id).filter((id) => !revealIds.includes(id)));
  if (revealIds.length) {
    const { error: itemsError } = await supabase
      .from("crm_booking_items")
      .update({ visible_to_client: true })
      .in("id", revealIds);
    if (itemsError) throw new Error(itemsError.message);
  }
  const { data: docs, error: docsLookupError } = await supabase
    .from("crm_booking_documents")
    .select("id, booking_item_id")
    .eq("booking_id", bookingId);
  if (docsLookupError) throw new Error(docsLookupError.message);
  const revealDocs = ((docs || []) as { id: string; booking_item_id?: string | null }[])
    .filter((doc) => !doc.booking_item_id || !hiddenIds.has(doc.booking_item_id))
    .map((doc) => doc.id);
  if (revealDocs.length) {
    const { error: docsError } = await supabase
      .from("crm_booking_documents")
      .update({ visible_to_client: true })
      .in("id", revealDocs);
    if (docsError) throw new Error(docsError.message);
  }
}


/**
 * Formalité (ETA-IL, ESTA, Royaume-Uni) : le séjour s’ouvre par le même chemin que « Montrer au client »
 * (garde-fou carnet, cartes et pièces révélées, grand livre), sans révéler des prix encore masqués.
 * Lève si le dossier n’a aucune carte.
 */
export async function openStayForVisa(
  supabase: SupabaseClient,
  booking: CrmBooking,
  options?: { prices?: boolean }
) {
  const opened = visibilityOnRequest({
    visible: booking.visible_to_client,
    prices: booking.prices_visible !== false && booking.visible_to_client,
  });
  const prices = options?.prices ?? opened.prices;
  await setCarnetPublished(supabase, booking.id, opened.visible, { prices });
  const { data } = await supabase.from("crm_bookings").select("*").eq("id", booking.id).maybeSingle();
  const refreshed: CrmBooking = data
    ? (data as CrmBooking)
    : { ...booking, visible_to_client: opened.visible, prices_visible: prices };
  await syncBookingLedger(supabase, refreshed, booking.status);
  return { booking: refreshed, newlyPublished: !booking.visible_to_client };
}
