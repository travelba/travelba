import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "./bookings";
import { pliantAgencyCardLabel } from "./pliant-match";
import { pliantExpenseTitle } from "./pliant-booking";
import { revolutDebitLine } from "./revolut-inbox";
import {
  accountLines,
  mapTripCost,
  saleLines,
  suggestCostTargets,
  suggestItem,
  tripCostFromPliant,
  tripCostFromRevolut,
  tripTotals,
  type CostSuggestion,
  type CostTargetBooking,
  type OutgoingLine,
  type SaleLedgerRow,
  type TripCost,
  type TripCostDraft,
  type TripCostRow,
  type TripCostSource,
} from "./trip-costs";
import { createServiceClient } from "@/lib/supabase/admin";

const COST_SELECT =
  "id, booking_id, booking_item_id, source, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on";

const PLIANT_SELECT =
  "id, pliant_transaction_id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, match_status";

const REVOLUT_SELECT =
  "id, direction, status, amount, currency, counterparty_name, reference, booked_at, raw";

type PliantRow = {
  id: string;
  pliant_transaction_id: string;
  card_id: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  booked_at: string | null;
  card_label: string | null;
  card_last4: string | null;
  match_status: string;
};

type RevolutRow = {
  id: string;
  direction: string;
  status: string;
  amount: number | string;
  currency: string;
  counterparty_name: string | null;
  reference: string | null;
  booked_at: string | null;
  raw: unknown;
};

export class TripCostError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function loadTripCosts(bookingId: string, admin: SupabaseClient = createServiceClient()) {
  const { data, error } = await admin
    .from("crm_trip_costs")
    .select(COST_SELECT)
    .eq("booking_id", bookingId)
    .order("occurred_on", { ascending: true, nullsFirst: false });
  if (error) throw new TripCostError(error.message, 500);
  return ((data || []) as TripCostRow[]).map(mapTripCost);
}

async function pliantRow(admin: SupabaseClient, id: string) {
  const { data } = await admin.from("crm_pliant_transactions").select(PLIANT_SELECT).eq("id", id).maybeSingle();
  return (data as PliantRow | null) || null;
}

async function revolutRow(admin: SupabaseClient, id: string) {
  const { data } = await admin.from("crm_revolut_transactions").select(REVOLUT_SELECT).eq("id", id).maybeSingle();
  return (data as RevolutRow | null) || null;
}

async function draftFor(
  admin: SupabaseClient,
  source: TripCostSource,
  sourceId: string,
  eurAmount: number | null | undefined
): Promise<TripCostDraft> {
  if (source === "pliant") {
    const row = await pliantRow(admin, sourceId);
    if (!row) throw new TripCostError("Dépense introuvable.", 404);
    const draft = tripCostFromPliant(row);
    if (!draft) throw new TripCostError("Cette dépense n’est pas comptabilisée par Pliant.");
    return draft;
  }
  const row = await revolutRow(admin, sourceId);
  if (!row) throw new TripCostError("Sortie introuvable.", 404);
  const draft = tripCostFromRevolut(row, eurAmount);
  if (!draft) throw new TripCostError("Indiquez le coût en euros de cette sortie.");
  return draft;
}

/**
 * État de la sortie côté source. Revolut garde aussi le dossier (`matched_booking_id`) et la date du clic
 * (`settled_at`) : « hors voyage » tient à la synchro, « à rattacher » les remet à zéro.
 */
async function markSource(
  admin: SupabaseClient,
  source: TripCostSource,
  sourceId: string,
  state: "matched" | "unmatched" | "ignored",
  link?: { bookingId: string; customerId: string | null }
) {
  if (source === "pliant") {
    const { error } = await admin
      .from("crm_pliant_transactions")
      .update({ match_status: state, matched_transaction_id: null })
      .eq("id", sourceId);
    if (error) throw new TripCostError(error.message, 500);
    return;
  }
  const patch: Record<string, unknown> =
    state === "unmatched"
      ? { status: state, matched_booking_id: null, matched_customer_id: null, matched_transaction_id: null, settled_at: null }
      : state === "ignored"
        ? { status: state, settled_at: new Date().toISOString() }
        : {
            status: state,
            matched_booking_id: link?.bookingId || null,
            matched_customer_id: link?.customerId || null,
            matched_transaction_id: null,
            settled_at: new Date().toISOString(),
          };
  const { error } = await admin.from("crm_revolut_transactions").update(patch).eq("id", sourceId);
  if (error) throw new TripCostError(error.message, 500);
}

export type AttachInput = {
  source: TripCostSource;
  sourceId: string;
  bookingId: string;
  /** Carte ou dépense. Nul : la ligne qui ressemble au fournisseur, sinon le montant global du séjour. */
  itemId?: string | null;
  /** Vrai : l’agent a choisi « Montant du séjour » explicitement ; pas de ligne devinée. */
  stayOnly?: boolean;
  /** Nouvelle dépense libre, prix vendu pré-rempli au coût. */
  newExpense?: { title?: string | null; amount: number } | null;
  /** Sortie Revolut hors euros : coût en euros saisi par l’agent. */
  eurAmount?: number | null;
};

/** Rattache une sortie à une ligne du dossier. Rien ne part au client : la vente ne bouge pas. */
export async function attachOutgoing(input: AttachInput, admin: SupabaseClient = createServiceClient()) {
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) throw new TripCostError("Séjour introuvable.", 404);
  const payer = (booking as { billing_customer_id?: string | null; customer_id?: string | null }).billing_customer_id
    || (booking as { customer_id?: string | null }).customer_id
    || null;
  const draft = await draftFor(admin, input.source, input.sourceId, input.eurAmount);

  let itemId = input.itemId || null;
  if (input.newExpense) {
    const amount = Number(input.newExpense.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new TripCostError("Prix vendu requis.");
    const { data: existing } = await admin.from("crm_booking_items").select("sort_order").eq("booking_id", input.bookingId);
    const maxSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
    const { data: item, error } = await admin
      .from("crm_booking_items")
      .insert({
        booking_id: input.bookingId,
        kind: "expense",
        title: pliantExpenseTitle(input.newExpense.title || draft.supplier),
        amount: Math.round(amount * 100) / 100,
        include_in_ledger: true,
        sort_order: maxSort + 1,
        details: input.source === "pliant" ? { pliant_transaction_id: input.sourceId } : {},
        visible_to_client: false,
      })
      .select("id")
      .single();
    if (error || !item) throw new TripCostError(error?.message || "La dépense n’a pas pu être créée.", 500);
    itemId = String(item.id);
    await refreshBookingLedger(admin, input.bookingId);
  } else if (itemId) {
    const { data: item } = await admin
      .from("crm_booking_items")
      .select("id")
      .eq("id", itemId)
      .eq("booking_id", input.bookingId)
      .maybeSingle();
    if (!item) throw new TripCostError("Cette ligne n’est pas sur ce séjour.", 404);
  } else if (!input.stayOnly) {
    itemId = await defaultItemFor(admin, input.bookingId, draft);
  }

  const { data: inserted, error } = await admin
    .from("crm_trip_costs")
    .insert({
      booking_id: input.bookingId,
      booking_item_id: itemId,
      source: draft.source,
      source_id: draft.sourceId,
      amount_eur: draft.amountEur,
      original_amount: draft.originalAmount,
      original_currency: draft.originalCurrency,
      supplier: draft.supplier,
      occurred_on: draft.occurredOn,
    })
    .select(COST_SELECT)
    .single();
  if (error || !inserted) {
    if (/duplicate|unique/i.test(String(error?.message || ""))) {
      throw new TripCostError("Cette sortie est déjà rattachée.", 409);
    }
    throw new TripCostError(error?.message || "Rattachement impossible.", 500);
  }
  await markSource(admin, draft.source, draft.sourceId, "matched", { bookingId: input.bookingId, customerId: payer });
  return mapTripCost(inserted as TripCostRow);
}

/**
 * Ligne retenue quand l’agent n’en choisit pas : la carte dont le nom ressemble au fournisseur,
 * sinon l’unique ligne vendue si le montant global du séjour n’est plus au livre, sinon le séjour.
 */
async function defaultItemFor(
  admin: SupabaseClient,
  bookingId: string,
  draft: { supplier: string | null; amountEur: number }
): Promise<string | null> {
  const [targets, { data: debits }] = await Promise.all([
    loadCostTargets(admin, bookingId),
    admin
      .from("crm_transactions")
      .select("id, booking_id, direction, kind, status, currency, amount, label, external_id")
      .eq("booking_id", bookingId)
      .eq("direction", "debit")
      .eq("status", "posted"),
  ]);
  const booking = targets[0];
  const sales = saleLines((debits || []) as SaleLedgerRow[], bookingId);
  if (booking) {
    const hit = suggestItem(booking, { party: draft.supplier, amount: Math.abs(draft.amountEur) });
    if (hit.itemId && hit.reason === "supplier") return hit.itemId;
  }
  if (!sales.some((line) => line.nature === "stay")) {
    const sold = sales.filter((line) => line.itemId);
    if (sold.length === 1) return sold[0].itemId;
  }
  return null;
}

/** Déplace un coût vers une autre ligne du même voyage (null = montant du séjour). */
export async function retargetTripCost(costId: string, itemId: string | null, admin: SupabaseClient = createServiceClient()) {
  const { data } = await admin.from("crm_trip_costs").select(COST_SELECT).eq("id", costId).maybeSingle();
  if (!data) throw new TripCostError("Coût introuvable.", 404);
  const cost = mapTripCost(data as TripCostRow);
  if (itemId) {
    const { data: item } = await admin
      .from("crm_booking_items")
      .select("id")
      .eq("id", itemId)
      .eq("booking_id", cost.bookingId)
      .maybeSingle();
    if (!item) throw new TripCostError("Cette ligne n’est pas sur ce séjour.", 404);
  }
  const { error } = await admin.from("crm_trip_costs").update({ booking_item_id: itemId }).eq("id", costId);
  if (error) throw new TripCostError(error.message, 500);
  return { ...cost, bookingItemId: itemId };
}

/** Retire un coût : la sortie revient dans la file à rattacher. La vente reste. */
export async function detachTripCost(costId: string, admin: SupabaseClient = createServiceClient()) {
  const { data } = await admin.from("crm_trip_costs").select(COST_SELECT).eq("id", costId).maybeSingle();
  if (!data) throw new TripCostError("Coût introuvable.", 404);
  const cost = mapTripCost(data as TripCostRow);
  const { error } = await admin.from("crm_trip_costs").delete().eq("id", costId);
  if (error) throw new TripCostError(error.message, 500);
  await markSource(admin, cost.source, cost.sourceId, "unmatched");
  return cost;
}

/** Hors voyage : frais d’agence, abonnement, salaire. La sortie quitte la file sans dossier. */
export async function setOutgoingOutsideTrip(
  source: TripCostSource,
  sourceId: string,
  outside: boolean,
  admin: SupabaseClient = createServiceClient()
) {
  const { data: existing } = await admin
    .from("crm_trip_costs")
    .select("id")
    .eq("source", source)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (existing) throw new TripCostError("Cette sortie est rattachée à un voyage. Détachez-la d’abord.", 409);
  await markSource(admin, source, sourceId, outside ? "ignored" : "unmatched");
}

export type OutgoingQueueFilter = {
  bookingId?: string | null;
  source?: TripCostSource | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
};

type ItemRow = {
  id: string;
  booking_id: string;
  kind: string | null;
  title: string | null;
  supplier: string | null;
  amount: number | null;
  details: Record<string, unknown> | null;
  lifecycle: string | null;
};

async function chunked<T>(ids: string[], run: (slice: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let index = 0; index < ids.length; index += 100) out.push(...(await run(ids.slice(index, index + 100))));
  return out;
}

/** Dossiers ouverts (non annulés) avec leurs lignes : la base des propositions. */
export async function loadCostTargets(admin: SupabaseClient, bookingId?: string | null): Promise<CostTargetBooking[]> {
  let query = admin
    .from("crm_bookings")
    .select("id, reference, title, destination")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(400);
  if (bookingId) query = admin.from("crm_bookings").select("id, reference, title, destination").eq("id", bookingId);
  const { data: bookings } = await query;
  const rows = (bookings || []) as { id: string; reference: string; title: string | null; destination: string | null }[];
  if (!rows.length) return [];
  const items = await chunked(
    rows.map((row) => row.id),
    async (slice) => {
      const { data } = await admin
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, supplier, amount, details, lifecycle")
        .in("booking_id", slice);
      return (data || []) as ItemRow[];
    }
  );
  const byBooking = new Map<string, ItemRow[]>();
  for (const item of items) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(item);
    byBooking.set(item.booking_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    destination: row.destination,
    items: (byBooking.get(row.id) || []).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      supplier: item.supplier,
      amount: item.amount == null ? null : Number(item.amount),
      details: item.details,
      lifecycle: item.lifecycle,
    })),
  }));
}

async function cardBookings(admin: SupabaseClient, cardIds: string[]) {
  const map = new Map<string, string[]>();
  const push = (cardId: string | null, bookingId: string | null) => {
    if (!cardId || !bookingId) return;
    const list = map.get(cardId) || [];
    if (!list.includes(bookingId)) list.push(bookingId);
    map.set(cardId, list);
  };
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return map;
  for (const table of ["crm_pliant_cards", "crm_booking_cards", "crm_hotel_arrivals"]) {
    const rows = await chunked(ids, async (slice) => {
      const { data } = await admin.from(table).select("pliant_card_id, booking_id").in("pliant_card_id", slice);
      return (data || []) as { pliant_card_id: string | null; booking_id: string | null }[];
    });
    for (const row of rows) push(row.pliant_card_id, row.booking_id);
  }
  return map;
}

export function itemLabelFor(item: { kind: string | null; title: string | null; details?: Record<string, unknown> | null }) {
  const details = item.details || {};
  const hotel = typeof details.hotel_name === "string" ? details.hotel_name.trim() : "";
  return hotel || (item.title || "").trim() || "Ligne";
}

/**
 * Sorties à rattacher : dépenses Pliant comptabilisées, virements Revolut sortants,
 * remboursements fournisseur Revolut. Avec une proposition par dossier ; jamais d’écriture.
 */
export async function loadOutgoingQueue(
  filter: OutgoingQueueFilter = {},
  admin: SupabaseClient = createServiceClient()
): Promise<OutgoingLine[]> {
  const limit = filter.limit ?? 500;
  const targets = await loadCostTargets(admin, null);
  const lines: OutgoingLine[] = [];

  if (filter.source !== "revolut") {
    let query = admin
      .from("crm_pliant_transactions")
      .select(PLIANT_SELECT)
      .eq("match_status", "unmatched")
      .in("status", ["BOOKED", "CONFIRMED"])
      .in("type", ["PURCHASE", "CASH_WITHDRAWAL", "REFUND", "CHARGEBACK"])
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (filter.from) query = query.gte("booked_at", filter.from);
    if (filter.to) query = query.lte("booked_at", `${filter.to}T23:59:59`);
    const { data } = await query;
    const rows = (data || []) as PliantRow[];
    const cards = await cardBookings(
      admin,
      rows.map((row) => row.card_id || "")
    );
    for (const row of rows) {
      const draft = tripCostFromPliant(row);
      if (!draft) continue;
      const cardBookingIds = row.card_id ? cards.get(row.card_id) || [] : [];
      const suggestions = suggestCostTargets(
        { text: row.merchant, party: row.merchant, amount: Math.abs(draft.amountEur), cardBookingIds },
        targets
      );
      lines.push({
        source: "pliant",
        id: row.id,
        party: (row.merchant || "").trim() || "Dépense",
        amount: draft.originalAmount ?? Math.abs(draft.amountEur),
        currency: draft.originalCurrency || "EUR",
        eurAmount: draft.amountEur,
        refund: draft.amountEur < 0,
        occurredOn: draft.occurredOn,
        card: [row.card_label, row.card_last4 ? `···· ${row.card_last4}` : ""].filter(Boolean).join(" ") || null,
        text: "",
        kind: draft.amountEur < 0 ? "Remboursement" : "Carte",
        agencyCard: pliantAgencyCardLabel(row.card_label),
        suggestions: decorate(suggestions, targets),
      });
    }
  }

  if (filter.source !== "pliant") {
    let query = admin
      .from("crm_revolut_transactions")
      .select(REVOLUT_SELECT)
      .eq("direction", "debit")
      .eq("status", "unmatched")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (filter.from) query = query.gte("booked_at", filter.from);
    if (filter.to) query = query.lte("booked_at", `${filter.to}T23:59:59`);
    const { data } = await query;
    for (const row of (data || []) as RevolutRow[]) {
      const line = revolutDebitLine(row);
      const draft = tripCostFromRevolut(row, null);
      const suggestions = suggestCostTargets(
        { text: `${line.reference} ${row.reference || ""}`, party: line.party, amount: line.amount },
        targets
      );
      lines.push({
        source: "revolut",
        id: row.id,
        party: line.party,
        amount: line.amount,
        currency: line.currency,
        eurAmount: draft ? draft.amountEur : null,
        refund: false,
        occurredOn: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
        card: null,
        text: line.reference,
        kind: line.kind,
        agencyCard: false,
        suggestions: decorate(suggestions, targets),
      });
    }
  }

  const scoped = filter.bookingId
    ? lines.filter((line) => line.suggestions.some((hit) => hit.bookingId === filter.bookingId))
    : lines;
  return scoped.sort((left, right) => (right.occurredOn || "").localeCompare(left.occurredOn || ""));
}

function decorate(suggestions: CostSuggestion[], targets: CostTargetBooking[]) {
  return suggestions.slice(0, 3).flatMap((hit) => {
    const booking = targets.find((row) => row.id === hit.bookingId);
    if (!booking) return [];
    const item = hit.itemId ? booking.items.find((row) => row.id === hit.itemId) || null : null;
    return [
      {
        ...hit,
        reference: booking.reference,
        title: booking.title || booking.destination || "",
        itemLabel: item ? itemLabelFor(item) : null,
      },
    ];
  });
}

export type TripAccounting = ReturnType<typeof accountLines> & {
  totals: ReturnType<typeof tripTotals>;
  costs: TripCost[];
  items: { id: string; label: string; kind: string | null; amount: number | null; onLedger: boolean }[];
};

/** Ventes du dossier (débits postés), coûts rattachés, marge par ligne. */
export async function loadTripAccounting(bookingId: string, admin: SupabaseClient = createServiceClient()): Promise<TripAccounting> {
  const [{ data: debits }, costs, { data: items }] = await Promise.all([
    admin
      .from("crm_transactions")
      .select("id, booking_id, direction, kind, status, currency, amount, label, external_id")
      .eq("booking_id", bookingId)
      .eq("direction", "debit")
      .eq("status", "posted"),
    loadTripCosts(bookingId, admin),
    admin
      .from("crm_booking_items")
      .select("id, kind, title, amount, details, lifecycle")
      .eq("booking_id", bookingId)
      .order("sort_order"),
  ]);
  const lines = saleLines((debits || []) as SaleLedgerRow[], bookingId);
  const accounted = accountLines(lines, costs);
  const soldItemIds = new Set(lines.map((line) => line.itemId).filter(Boolean));
  return {
    ...accounted,
    costs,
    totals: tripTotals(accounted.lines, accounted.unsold),
    items: ((items || []) as ItemRow[])
      .filter((item) => item.lifecycle !== "superseded" && item.lifecycle !== "cancelled")
      .map((item) => ({
        id: item.id,
        label: itemLabelFor(item),
        kind: item.kind,
        amount: item.amount == null ? null : Number(item.amount),
        onLedger: soldItemIds.has(item.id),
      })),
  };
}
