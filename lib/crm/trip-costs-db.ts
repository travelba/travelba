import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "./bookings";
import { pliantAgencyCardLabel } from "./pliant-match";
import { pliantExpenseTitle } from "./pliant-booking";
import { withoutRefusedSuggestions, type TripCostActor } from "./pliant-link";
import { revolutDebitLine } from "./revolut-inbox";
import { loadBookingCommissions } from "./supplier-commission-db";
import {
  accountLines,
  isFixedCostParty,
  isOwnAccountTransfer,
  mapTripCost,
  saleLines,
  suggestCostTargets,
  suggestItem,
  tripCostFromPliant,
  tripCostFromRevolut,
  tripTotals,
  type CostSuggestion,
  type CostTargetBooking,
  type OutgoingCardInfo,
  type OutgoingLine,
  type SaleLedgerRow,
  type TripCost,
  type TripCostDraft,
  type TripCostRow,
  type TripCostSource,
} from "./trip-costs";
import { createServiceClient } from "@/lib/supabase/admin";

const COST_SELECT =
  "id, booking_id, booking_item_id, source, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on, instrument, instrument_detail";
const COST_SELECT_STATE = `${COST_SELECT}, state`;

const PLIANT_SELECT =
  "id, pliant_transaction_id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, match_status, customer_id, matched_customer_id";

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
  customer_id?: string | null;
  matched_customer_id?: string | null;
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
  const first = await admin
    .from("crm_trip_costs")
    .select(COST_SELECT_STATE)
    .eq("booking_id", bookingId)
    .order("occurred_on", { ascending: true, nullsFirst: false });
  const fallback =
    first.error && /state/i.test(first.error.message || "")
      ? await admin
          .from("crm_trip_costs")
          .select(COST_SELECT)
          .eq("booking_id", bookingId)
          .order("occurred_on", { ascending: true, nullsFirst: false })
      : first;
  if (fallback.error) throw new TripCostError(fallback.error.message, 500);
  return ((fallback.data || []) as TripCostRow[]).map(mapTripCost);
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

function missingEventsTable(message: string) {
  return /crm_trip_cost_events|schema cache|does not exist/i.test(message);
}

async function bookingReference(admin: SupabaseClient, id: string | null) {
  if (!id) return null;
  const { data } = await admin.from("crm_bookings").select("reference").eq("id", id).maybeSingle();
  return ((data as { reference?: string | null } | null)?.reference || "").trim() || null;
}

/** Qui, quand, de quel dossier vers quel dossier. Pas de numéro de carte. */
async function recordTripCostEvent(
  admin: SupabaseClient,
  input: {
    actor?: TripCostActor | null;
    action: "attach" | "detach" | "move" | "refuse" | "correction";
    source: TripCostSource;
    sourceId: string;
    fromBookingId?: string | null;
    toBookingId?: string | null;
    fromItemId?: string | null;
    toItemId?: string | null;
    fromReference?: string | null;
    toReference?: string | null;
    note?: string | null;
  }
) {
  const { error } = await admin.from("crm_trip_cost_events").insert({
    staff_id: input.actor?.staffId || null,
    actor: (input.actor?.label || "").trim().slice(0, 80) || null,
    action: input.action,
    source: input.source,
    source_id: input.sourceId,
    from_booking_id: input.fromBookingId || null,
    to_booking_id: input.toBookingId || null,
    from_item_id: input.fromItemId || null,
    to_item_id: input.toItemId || null,
    from_reference: input.fromReference || null,
    to_reference: input.toReference || null,
    note: input.note ? input.note.slice(0, 500) : null,
  });
  if (error) {
    if (missingEventsTable(error.message)) throw new TripCostError("Journal des rattachements indisponible.", 500);
    throw new TripCostError(error.message, 500);
  }
}

async function refusedBookingIds(admin: SupabaseClient, source: TripCostSource, ids: string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { data, error } = await admin
      .from("crm_trip_cost_events")
      .select("source_id, to_booking_id")
      .eq("source", source)
      .eq("action", "refuse")
      .in("source_id", slice);
    if (error) {
      if (missingEventsTable(error.message)) return map;
      throw new TripCostError(error.message, 500);
    }
    for (const row of (data || []) as { source_id: string; to_booking_id: string | null }[]) {
      if (!row.to_booking_id) continue;
      const list = map.get(row.source_id) || [];
      if (!list.includes(row.to_booking_id)) list.push(row.to_booking_id);
      map.set(row.source_id, list);
    }
  }
  return map;
}

export type TripCostEventView = {
  action: string;
  at: string;
  who: string | null;
  fromReference: string | null;
  toReference: string | null;
};

/** Dernier geste sur chaque dépense, pour la ligne sous la carte. */
export async function loadLatestTripCostEvents(sourceIds: string[], admin: SupabaseClient = createServiceClient()) {
  const map = new Map<string, TripCostEventView>();
  const ids = [...new Set(sourceIds.filter(Boolean))];
  for (let index = 0; index < ids.length; index += 100) {
    const slice = ids.slice(index, index + 100);
    const { data, error } = await admin
      .from("crm_trip_cost_events")
      .select("source_id, action, created_at, actor, from_reference, to_reference")
      .eq("source", "pliant")
      .in("source_id", slice)
      .order("created_at", { ascending: false });
    if (error) {
      if (missingEventsTable(error.message)) return map;
      throw new TripCostError(error.message, 500);
    }
    for (const row of (data || []) as {
      source_id: string;
      action: string;
      created_at: string;
      actor: string | null;
      from_reference: string | null;
      to_reference: string | null;
    }[]) {
      if (map.has(row.source_id)) continue;
      map.set(row.source_id, {
        action: row.action,
        at: row.created_at,
        who: row.actor,
        fromReference: row.from_reference,
        toReference: row.to_reference,
      });
    }
  }
  return map;
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
  /** Qui fait le geste. Le journal garde le nom, pas l’e-mail. */
  actor?: TripCostActor | null;
};

async function resolveCostItem(admin: SupabaseClient, input: AttachInput, draft: TripCostDraft) {
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
    await refreshBookingLedger(admin, input.bookingId);
    return String(item.id);
  }
  if (input.itemId) {
    const { data: item } = await admin
      .from("crm_booking_items")
      .select("id")
      .eq("id", input.itemId)
      .eq("booking_id", input.bookingId)
      .maybeSingle();
    if (!item) throw new TripCostError("Cette ligne n’est pas sur ce séjour.", 404);
    return input.itemId;
  }
  if (input.stayOnly) return null;
  return defaultItemFor(admin, input.bookingId, draft);
}

/** Rattache une sortie à une ligne du dossier. Rien ne part au client : la vente ne bouge pas. */
export async function attachOutgoing(input: AttachInput, admin: SupabaseClient = createServiceClient()) {
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) throw new TripCostError("Séjour introuvable.", 404);
  const bookingRow = booking as { reference?: string | null; billing_customer_id?: string | null; customer_id?: string | null };
  const payer = bookingRow.billing_customer_id || bookingRow.customer_id || null;
  const draft = await draftFor(admin, input.source, input.sourceId, input.eurAmount);
  const itemId = await resolveCostItem(admin, input, draft);

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
      instrument: draft.instrument,
      instrument_detail: draft.instrumentDetail,
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
  await recordTripCostEvent(admin, {
    actor: input.actor,
    action: "attach",
    source: draft.source,
    sourceId: draft.sourceId,
    toBookingId: input.bookingId,
    toItemId: itemId,
    toReference: (bookingRow.reference || "").trim() || null,
  });
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

/** Retire un coût : la sortie revient à proposer. La vente reste. */
export async function detachTripCost(
  costId: string,
  admin: SupabaseClient = createServiceClient(),
  actor?: TripCostActor | null
) {
  const { data } = await admin.from("crm_trip_costs").select(COST_SELECT).eq("id", costId).maybeSingle();
  if (!data) throw new TripCostError("Coût introuvable.", 404);
  const cost = mapTripCost(data as TripCostRow);
  const fromReference = await bookingReference(admin, cost.bookingId);
  const { error } = await admin.from("crm_trip_costs").delete().eq("id", costId);
  if (error) throw new TripCostError(error.message, 500);
  await markSource(admin, cost.source, cost.sourceId, "unmatched");
  if (cost.source === "pliant") {
    const { error: released } = await admin.from("crm_pliant_transactions").update({ link_released: true }).eq("id", cost.sourceId);
    if (released && !/link_released/i.test(released.message || "")) throw new TripCostError(released.message, 500);
  }
  await recordTripCostEvent(admin, {
    actor,
    action: "detach",
    source: cost.source,
    sourceId: cost.sourceId,
    fromBookingId: cost.bookingId,
    fromItemId: cost.bookingItemId,
    fromReference,
  });
  return cost;
}

/** Déplace le coût vers un autre dossier. Une dépense reste entière : pas de partage. */
export async function moveOutgoing(input: AttachInput, admin: SupabaseClient = createServiceClient()) {
  const { data: existing } = await admin
    .from("crm_trip_costs")
    .select(COST_SELECT)
    .eq("source", input.source)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (!existing) throw new TripCostError("Cette dépense n’est pas rattachée.", 404);
  const cost = mapTripCost(existing as TripCostRow);
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (!booking) throw new TripCostError("Séjour introuvable.", 404);
  const bookingRow = booking as { reference?: string | null; billing_customer_id?: string | null; customer_id?: string | null };
  const draft = await draftFor(admin, input.source, input.sourceId, input.eurAmount);
  const itemId = await resolveCostItem(admin, input, draft);
  if (cost.bookingId === input.bookingId && (cost.bookingItemId || null) === (itemId || null)) {
    throw new TripCostError("Cette dépense est déjà sur ce dossier.");
  }
  const fromReference = await bookingReference(admin, cost.bookingId);
  const { error } = await admin
    .from("crm_trip_costs")
    .update({
      booking_id: input.bookingId,
      booking_item_id: itemId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cost.id);
  if (error) throw new TripCostError(error.message, 500);
  const payer = bookingRow.billing_customer_id || bookingRow.customer_id || null;
  await markSource(admin, cost.source, cost.sourceId, "matched", { bookingId: input.bookingId, customerId: payer });
  await recordTripCostEvent(admin, {
    actor: input.actor,
    action: "move",
    source: cost.source,
    sourceId: cost.sourceId,
    fromBookingId: cost.bookingId,
    toBookingId: input.bookingId,
    fromItemId: cost.bookingItemId,
    toItemId: itemId,
    fromReference,
    toReference: (bookingRow.reference || "").trim() || null,
  });
  return { ...cost, previousBookingId: cost.bookingId, bookingId: input.bookingId, bookingItemId: itemId };
}

/** Écarte la proposition affichée. La dépense reste à proposer. */
export async function refuseOutgoingSuggestion(
  input: { source: TripCostSource; sourceId: string; bookingId: string; actor?: TripCostActor | null },
  admin: SupabaseClient = createServiceClient()
) {
  const { data: booking } = await admin.from("crm_bookings").select("id, reference").eq("id", input.bookingId).maybeSingle();
  if (!booking) throw new TripCostError("Séjour introuvable.", 404);
  if (input.source === "pliant") {
    const row = await pliantRow(admin, input.sourceId);
    if (!row) throw new TripCostError("Dépense introuvable.", 404);
  } else {
    const row = await revolutRow(admin, input.sourceId);
    if (!row) throw new TripCostError("Sortie introuvable.", 404);
  }
  await recordTripCostEvent(admin, {
    actor: input.actor,
    action: "refuse",
    source: input.source,
    sourceId: input.sourceId,
    toBookingId: input.bookingId,
    toReference: ((booking as { reference?: string | null }).reference || "").trim() || null,
    note: "Proposition écartée.",
  });
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
  const select = "id, reference, title, destination, customer_id, start_date, end_date";
  let query = admin.from("crm_bookings").select(select).neq("status", "cancelled").order("created_at", { ascending: false }).limit(400);
  if (bookingId) query = admin.from("crm_bookings").select(select).eq("id", bookingId);
  const { data: bookings } = await query;
  const rows = (bookings || []) as {
    id: string;
    reference: string;
    title: string | null;
    destination: string | null;
    customer_id: string | null;
    start_date: string | null;
    end_date: string | null;
  }[];
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
    customerId: row.customer_id,
    startDate: row.start_date,
    endDate: row.end_date,
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

type CardRow = {
  pliant_card_id: string | null;
  booking_id: string | null;
  label?: string | null;
  last4?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  limit_cents?: number | null;
  ceiling_cents?: number | null;
  card_limit_cents?: number | null;
  currency?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  countries?: string[] | null;
  status?: string | null;
  closed_at?: string | null;
  card_closed_at?: string | null;
};

const CARD_SELECTS: Record<string, string> = {
  crm_pliant_cards: "pliant_card_id, booking_id, label, last4, ceiling_cents, currency, countries, status, closed_at",
  crm_booking_cards: "pliant_card_id, booking_id, label, last4, first_name, last_name, limit_cents, currency, valid_from, valid_to, status",
  crm_hotel_arrivals: "pliant_card_id, booking_id, card_limit_cents, currency, card_closed_at",
};

/**
 * Cartes Pliant générées depuis un dossier : le ou les dossiers, et ce que l’agence sait de la
 * carte (porteur, plafond, validité, pays). Une carte connue d’un dossier dit presque tout.
 */
async function cardBookings(admin: SupabaseClient, cardIds: string[]) {
  const map = new Map<string, { bookingIds: string[]; info: OutgoingCardInfo }>();
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return map;
  for (const [table, select] of Object.entries(CARD_SELECTS)) {
    const rows = await chunked(ids, async (slice) => {
      const { data } = await admin.from(table).select(select).in("pliant_card_id", slice);
      return ((data || []) as unknown) as CardRow[];
    });
    for (const row of rows) {
      if (!row.pliant_card_id) continue;
      const entry = map.get(row.pliant_card_id) || {
        bookingIds: [],
        info: { label: null, holder: null, limit: null, currency: "EUR", validFrom: null, validTo: null, countries: [], status: null },
      };
      if (row.booking_id && !entry.bookingIds.includes(row.booking_id)) entry.bookingIds.push(row.booking_id);
      const holder = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      const limitCents = row.limit_cents ?? row.ceiling_cents ?? row.card_limit_cents ?? null;
      entry.info = {
        label: entry.info.label || (row.label || "").trim() || null,
        holder: entry.info.holder || holder || null,
        limit: entry.info.limit ?? (limitCents == null ? null : limitCents / 100),
        currency:
          row.card_limit_cents != null && row.limit_cents == null && row.ceiling_cents == null
            ? "EUR"
            : entry.info.currency !== "EUR"
              ? entry.info.currency
              : (row.currency || "EUR").toUpperCase(),
        validFrom: entry.info.validFrom || row.valid_from || null,
        validTo: entry.info.validTo || row.valid_to || null,
        countries: entry.info.countries.length ? entry.info.countries : row.countries || [],
        status: entry.info.status || (row.closed_at || row.card_closed_at ? "closed" : row.status || null),
      };
      map.set(row.pliant_card_id, entry);
    }
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
    const refused = await refusedBookingIds(
      admin,
      "pliant",
      rows.map((row) => row.id)
    );
    for (const row of rows) {
      const draft = tripCostFromPliant(row);
      if (!draft) continue;
      // Coût fixe de l’agence (logiciel, IA, téléphonie) : pas une sortie de voyage, rien à l’écran.
      if (isFixedCostParty(row.merchant)) continue;
      const card = row.card_id ? cards.get(row.card_id) || null : null;
      const cardBookingIds = card?.bookingIds || [];
      const cardBooking = cardBookingIds.map((id) => targets.find((target) => target.id === id)).find(Boolean) || null;
      const suggestions = withoutRefusedSuggestions(
        suggestCostTargets(
          {
            text: row.merchant,
            party: row.merchant,
            amount: Math.abs(draft.amountEur),
            cardBookingIds,
            customerId: row.customer_id || row.matched_customer_id || null,
            date: draft.occurredOn,
          },
          targets
        ),
        refused.get(row.id) || []
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
        cardInfo: card
          ? {
              ...card.info,
              label: card.info.label || row.card_label || null,
              bookingReference: cardBooking?.reference || null,
              bookingTitle: cardBooking?.title || null,
            }
          : null,
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
    const revolutRows = (data || []) as RevolutRow[];
    const refused = await refusedBookingIds(
      admin,
      "revolut",
      revolutRows.map((row) => row.id)
    );
    for (const row of revolutRows) {
      const line = revolutDebitLine(row);
      if (isFixedCostParty(line.party) || isFixedCostParty(row.counterparty_name)) continue;
      const draft = tripCostFromRevolut(row, null);
      const ownAccounts = isOwnAccountTransfer({
        party: line.party,
        text: `${line.reference} ${row.reference || ""} ${row.counterparty_name || ""}`,
        raw: row.raw,
      });
      // Trésorerie (From treso, To treso, EUR Main, virement interne) : jamais proposée à un voyage.
      // Elle reste dans la file globale, sans motif, pour Hors voyage.
      if (ownAccounts && filter.bookingId) continue;
      const suggestions = ownAccounts
        ? []
        : withoutRefusedSuggestions(
            suggestCostTargets(
              {
                text: `${line.reference} ${row.reference || ""}`,
                party: line.party,
                amount: line.amount,
                raw: row.raw,
              },
              targets
            ),
            refused.get(row.id) || []
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
        cardInfo: null,
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
  const itemRows = (items || []) as ItemRow[];
  const stored = await loadBookingCommissions(admin, bookingId);
  const commissions = [...stored.entries()].flatMap(([itemId, commission]) => {
    if (commission.attendue == null && commission.recue == null) return [];
    return [{ itemId, attendue: commission.attendue, recue: commission.recue }];
  });
  const accounted = accountLines(lines, costs, commissions);
  const soldItemIds = new Set(lines.map((line) => line.itemId).filter(Boolean));
  return {
    ...accounted,
    costs,
    totals: tripTotals(accounted.lines, accounted.unsold, accounted.looseCommission),
    items: itemRows
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
