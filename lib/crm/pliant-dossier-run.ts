import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { shownPersonName } from "./identity";
import {
  dossierPendingCosts,
  planDossierPliantSpends,
  singleCardBooking,
  type DossierCostSnap,
  type DossierSpend,
  type DossierSpendAction,
} from "./pliant-dossier";
import { pliantDossierLabels, type PliantDossierLink, type PliantStayRef } from "./pliant-tx";
import type { TripCost } from "./trip-costs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SPEND_COLUMNS =
  "id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_last4, match_status, link_released";

function chunks<T>(rows: T[], size = 100) {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
}

function missingColumn(error: { message?: string } | null, column: string) {
  return Boolean(error?.message && error.message.toLowerCase().includes(column.toLowerCase()));
}

async function cardLinks(admin: SupabaseClient) {
  const rows: { cardId: string | null; bookingId: string | null }[] = [];
  const { data: issued } = await admin
    .from("crm_booking_cards")
    .select("pliant_card_id, booking_id, status")
    .not("booking_id", "is", null)
    .not("pliant_card_id", "is", null);
  for (const row of (issued || []) as Row[]) {
    if (row.status === "terminated") continue;
    rows.push({ cardId: row.pliant_card_id || null, bookingId: row.booking_id || null });
  }
  for (const table of ["crm_pliant_cards", "crm_hotel_arrivals"] as const) {
    const { data } = await admin.from(table).select("pliant_card_id, booking_id").not("booking_id", "is", null).not("pliant_card_id", "is", null);
    for (const row of (data || []) as Row[]) rows.push({ cardId: row.pliant_card_id || null, bookingId: row.booking_id || null });
  }
  return rows;
}

async function selectSpends(admin: SupabaseClient, cardIds: string[]) {
  const spends: DossierSpend[] = [];
  let releasedKnown = true;
  for (const slice of chunks(cardIds)) {
    const columns = releasedKnown ? SPEND_COLUMNS : SPEND_COLUMNS.replace(", link_released", "");
    const first = await admin.from("crm_pliant_transactions").select(columns).in("card_id", slice);
    let data = first.data as Row[] | null;
    if (first.error && missingColumn(first.error, "link_released")) {
      releasedKnown = false;
      const second = await admin
        .from("crm_pliant_transactions")
        .select(SPEND_COLUMNS.replace(", link_released", ""))
        .in("card_id", slice);
      if (second.error) throw new Error(second.error.message);
      data = second.data as Row[] | null;
    } else if (first.error) {
      throw new Error(first.error.message);
    }
    for (const row of data || []) {
      spends.push({
        id: String(row.id),
        cardId: row.card_id || null,
        status: row.status || null,
        type: row.type || null,
        merchant: row.merchant || null,
        billingCents: row.billing_cents == null ? null : Number(row.billing_cents),
        billingCurrency: row.billing_currency || null,
        transactionCents: row.transaction_cents == null ? null : Number(row.transaction_cents),
        transactionCurrency: row.transaction_currency || null,
        bookedAt: row.booked_at || null,
        cardLast4: row.card_last4 || null,
        matchStatus: row.match_status || null,
        released: row.link_released === true,
      });
    }
  }
  return spends;
}

async function selectCosts(admin: SupabaseClient, spendIds: string[]) {
  const costs: DossierCostSnap[] = [];
  let stateKnown = true;
  for (const slice of chunks(spendIds)) {
    const columns = stateKnown
      ? "id, booking_id, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on, state"
      : "id, booking_id, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on";
    const first = await admin.from("crm_trip_costs").select(columns).eq("source", "pliant").in("source_id", slice);
    let data = first.data as Row[] | null;
    if (first.error && missingColumn(first.error, "state")) {
      stateKnown = false;
      const second = await admin
        .from("crm_trip_costs")
        .select("id, booking_id, source_id, amount_eur, original_amount, original_currency, supplier, occurred_on")
        .eq("source", "pliant")
        .in("source_id", slice);
      if (second.error) throw new Error(second.error.message);
      data = second.data as Row[] | null;
    } else if (first.error) {
      throw new Error(first.error.message);
    }
    if (!stateKnown) return { costs, stateKnown };
    for (const row of data || []) {
      costs.push({
        id: String(row.id),
        bookingId: String(row.booking_id),
        sourceId: String(row.source_id),
        amountEur: Number(row.amount_eur),
        originalAmount: row.original_amount == null ? null : Number(row.original_amount),
        originalCurrency: row.original_currency || null,
        state: row.state === "pending" ? "pending" : "posted",
        supplier: row.supplier || null,
        occurredOn: row.occurred_on ? String(row.occurred_on).slice(0, 10) : null,
      });
    }
  }
  return { costs, stateKnown };
}

async function applyAction(admin: SupabaseClient, action: DossierSpendAction) {
  if (action.op === "drop") {
    const { error } = await admin.from("crm_trip_costs").delete().eq("id", action.costId);
    if (error) throw new Error(error.message);
    await admin.from("crm_pliant_transactions").update({ match_status: "unmatched" }).eq("id", action.spendId);
    return;
  }
  const draft = action.draft;
  const row = {
    amount_eur: draft.amountEur,
    original_amount: draft.originalAmount,
    original_currency: draft.originalCurrency,
    supplier: draft.supplier,
    occurred_on: draft.occurredOn,
    instrument: draft.instrument,
    instrument_detail: draft.instrumentDetail,
    state: action.state,
    updated_at: new Date().toISOString(),
  };
  if (action.op === "insert") {
    const { error } = await admin.from("crm_trip_costs").insert({
      ...row,
      booking_id: action.bookingId,
      booking_item_id: null,
      source: "pliant",
      source_id: action.spendId,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return;
      throw new Error(error.message);
    }
  } else {
    const { error } = await admin.from("crm_trip_costs").update(row).eq("id", action.costId);
    if (error) throw new Error(error.message);
  }
  await admin.from("crm_pliant_transactions").update({ match_status: "matched" }).eq("id", action.spendId);
}

/** Recopie le dossier sur le registre quand la carte a été émise depuis le dossier. */
async function backfillCardBookings(admin: SupabaseClient, bookings: Map<string, string>) {
  const ids = [...bookings.keys()];
  for (const slice of chunks(ids)) {
    const { data } = await admin.from("crm_pliant_cards").select("pliant_card_id, booking_id").in("pliant_card_id", slice);
    for (const row of (data || []) as Row[]) {
      if (row.booking_id || !row.pliant_card_id) continue;
      const bookingId = bookings.get(row.pliant_card_id);
      if (!bookingId) continue;
      await admin
        .from("crm_pliant_cards")
        .update({ booking_id: bookingId, updated_at: new Date().toISOString() })
        .eq("pliant_card_id", row.pliant_card_id)
        .is("booking_id", null);
    }
  }
}

/**
 * Rattache les dépenses des cartes de dossier et met à jour le montant au règlement.
 * Sans la colonne `state`, rien n’est écrit : l’écran montre quand même l’autorisation.
 */
export async function linkDossierPliantSpends(admin: SupabaseClient) {
  const bookings = singleCardBooking(await cardLinks(admin));
  if (!bookings.size) return 0;
  await backfillCardBookings(admin, bookings);
  const spends = await selectSpends(admin, [...bookings.keys()]);
  if (!spends.length) return 0;
  const loaded = await selectCosts(
    admin,
    spends.map((row) => row.id)
  );
  if (!loaded.stateKnown) return 0;
  const actions = planDossierPliantSpends({ spends, cardBookingId: bookings, costs: loaded.costs });
  for (const action of actions) await applyAction(admin, action);
  return actions.length;
}

async function linksForBooking(admin: SupabaseClient, bookingId: string) {
  const rows: { cardId: string | null; bookingId: string | null }[] = [];
  const { data: issued } = await admin.from("crm_booking_cards").select("pliant_card_id, booking_id, status").eq("booking_id", bookingId);
  for (const row of (issued || []) as Row[]) {
    if (row.status === "terminated") continue;
    rows.push({ cardId: row.pliant_card_id || null, bookingId: row.booking_id || null });
  }
  for (const table of ["crm_pliant_cards", "crm_hotel_arrivals"] as const) {
    const { data } = await admin.from(table).select("pliant_card_id, booking_id").eq("booking_id", bookingId);
    for (const row of (data || []) as Row[]) rows.push({ cardId: row.pliant_card_id || null, bookingId: row.booking_id || null });
  }
  return rows;
}

/** Autorisations encore absentes du grand livre des coûts, pour l’onglet Argent et le MCP. */
export async function loadDossierPendingCosts(admin: SupabaseClient, bookingId: string, existingSourceIds: string[]) {
  const cardIds = [...singleCardBooking(await linksForBooking(admin, bookingId)).keys()];
  if (!cardIds.length) return [] as TripCost[];
  const spends = (await selectSpends(admin, cardIds)).filter((row) => (row.status || "").toUpperCase() === "PENDING");
  return dossierPendingCosts({ bookingId, spends, existingSourceIds });
}

/** Dossier, client et société d’une carte Pliant, pour la liste des dépenses. */
export async function loadPliantStayRefs(admin: SupabaseClient, cardIds: string[]): Promise<PliantStayRef[]> {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return [];
  const links: PliantDossierLink[] = [];
  const tables = [
    { name: "crm_booking_cards", last4: "last4" },
    { name: "crm_pliant_cards", last4: "last4" },
    { name: "crm_hotel_arrivals", last4: "card_last4" },
  ] as const;
  for (const table of tables) {
    for (const slice of chunks(ids)) {
      const { data } = await admin.from(table.name).select(`pliant_card_id, booking_id, ${table.last4}`).in("pliant_card_id", slice);
      for (const row of (data || []) as Row[]) {
        if (!row.pliant_card_id || !row.booking_id) continue;
        links.push({ cardId: row.pliant_card_id, bookingId: row.booking_id, last4: row[table.last4] || null });
      }
    }
  }
  const bookingIds = [...new Set(links.map((row) => row.bookingId))];
  if (!bookingIds.length) return [];
  const bookings: Row[] = [];
  for (const slice of chunks(bookingIds)) {
    const { data } = await admin
      .from("crm_bookings")
      .select("id, reference, title, destination, customer_id, billing_company_id")
      .in("id", slice);
    bookings.push(...((data || []) as Row[]));
  }
  const customerIds = [...new Set(bookings.map((row) => row.customer_id).filter(Boolean))] as string[];
  const companyIds = [...new Set(bookings.map((row) => row.billing_company_id).filter(Boolean))] as string[];
  const people: Row[] = [];
  const companies: Row[] = [];
  for (const slice of chunks(customerIds)) {
    const { data } = await admin.from("crm_customers").select("id, first_name, last_name, company_name").in("id", slice);
    people.push(...((data || []) as Row[]));
  }
  for (const slice of chunks(companyIds)) {
    const { data } = await admin.from("crm_billing_companies").select("id, company_name").in("id", slice);
    companies.push(...((data || []) as Row[]));
  }
  return pliantDossierLabels({
    links,
    bookings: bookings.map((row) => ({
      id: row.id,
      reference: row.reference || null,
      title: row.title || null,
      destination: row.destination || null,
      customerId: row.customer_id || null,
      companyId: row.billing_company_id || null,
    })),
    people: people.map((row) => ({
      id: row.id,
      name: shownPersonName({ first_name: row.first_name, last_name: row.last_name }),
      companyName: row.company_name || null,
    })),
    companies: companies.map((row) => ({ id: row.id, name: row.company_name || null })),
  });
}
