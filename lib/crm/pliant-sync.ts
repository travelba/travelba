import "server-only";
import { linkPliantSpend, mergePliantMerchant, pliantSpendFromApi, type PliantCardLink, type PliantSpendDraft } from "./pliant-spend";
import { listPliantTransactions, pliantConfigured, pliantTransactionDetails } from "./pliant";

type Admin = { from: (table: string) => any };

const WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

async function cardLinks(admin: Admin) {
  const sources = ["crm_booking_pliant_cards", "crm_visa_cards", "crm_hotel_arrivals"];
  const pairs: { cardId: string; bookingId: string }[] = [];
  for (const table of sources) {
    const { data, error } = await admin.from(table).select("pliant_card_id, booking_id");
    if (error) continue;
    for (const row of (data || []) as { pliant_card_id?: string | null; booking_id?: string | null }[]) {
      const cardId = row.pliant_card_id?.trim() || "";
      const bookingId = row.booking_id?.trim() || "";
      if (cardId && bookingId) pairs.push({ cardId, bookingId });
    }
  }
  const bookingIds = [...new Set(pairs.map((row) => row.bookingId))];
  const customers = new Map<string, string | null>();
  for (let index = 0; index < bookingIds.length; index += 100) {
    const slice = bookingIds.slice(index, index + 100);
    const { data } = await admin.from("crm_bookings").select("id, customer_id").in("id", slice);
    for (const row of (data || []) as { id?: string; customer_id?: string | null }[]) {
      if (row.id) customers.set(row.id, row.customer_id || null);
    }
  }
  const cards = new Map<string, PliantCardLink>();
  for (const pair of pairs) {
    if (!cards.has(pair.cardId)) {
      cards.set(pair.cardId, { bookingId: pair.bookingId, customerId: customers.get(pair.bookingId) || null });
    }
  }
  return cards;
}

async function listedSpends(organizationId: string, fromDate: string) {
  const raw: unknown[] = [];
  for (let page = 0; page < 8; page += 1) {
    const batch = await listPliantTransactions({ organizationId, fromDate, page });
    raw.push(...(Array.isArray(batch.data) ? batch.data : []));
    if (!batch.hasNextPage) break;
  }
  return raw.map(pliantSpendFromApi).filter((row): row is PliantSpendDraft => Boolean(row));
}

async function withMerchants(drafts: PliantSpendDraft[]) {
  const missing = drafts.filter((row) => !row.merchant).map((row) => row.pliantTransactionId);
  if (!missing.length) return drafts;
  const names = new Map<string, string>();
  for (let index = 0; index < missing.length; index += 100) {
    const details = await pliantTransactionDetails(missing.slice(index, index + 100));
    for (const detail of details) {
      if (!detail || typeof detail !== "object") continue;
      const id = typeof (detail as { transactionId?: unknown }).transactionId === "string"
        ? (detail as { transactionId: string }).transactionId
        : "";
      if (!id) continue;
      const named = mergePliantMerchant(
        { pliantTransactionId: id, pliantCardId: "", status: "", type: "PURCHASE", amountCents: 0, currency: "EUR", merchant: "", bookedAt: null },
        detail
      );
      if (named.merchant) names.set(id, named.merchant);
    }
  }
  return drafts.map((row) => (names.has(row.pliantTransactionId) ? { ...row, merchant: names.get(row.pliantTransactionId) || "" } : row));
}

export async function syncPliantSpend(admin: Admin, now = new Date()) {
  if (!pliantConfigured()) return { skipped: true as const, fetched: 0, upserted: 0 };
  const organizationId = process.env.PLIANT_ORGANIZATION_ID || "";
  if (!organizationId) return { skipped: true as const, fetched: 0, upserted: 0 };
  const drafts = await withMerchants(await listedSpends(organizationId, new Date(now.getTime() - WINDOW_MS).toISOString()));
  const cards = await cardLinks(admin);
  const rows = drafts.map((draft) => ({
    ...linkPliantSpend(draft, cards),
    updated_at: now.toISOString(),
  }));
  if (rows.length) {
    const { error } = await admin.from("crm_pliant_transactions").upsert(rows, { onConflict: "pliant_transaction_id" });
    if (error) throw new Error("Les dépenses Pliant n’ont pas été enregistrées.");
  }
  return { skipped: false as const, fetched: drafts.length, upserted: rows.length };
}
