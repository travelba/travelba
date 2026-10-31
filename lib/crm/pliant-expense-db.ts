import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "./bookings";
import {
  findPliantExpenseItem,
  pliantExpenseDraft,
  pliantExpenseRemovable,
  pliantExpenseSyncPatch,
} from "./pliant-expense";
import type { TripCostDraft } from "./trip-costs";

type ItemRow = {
  id: string;
  kind: string | null;
  lifecycle?: string | null;
  details: unknown;
  amount: number | string | null;
  sort_order?: number | null;
};

const ITEM_SELECT = "id, kind, lifecycle, details, amount, sort_order";

async function bookingItems(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin.from("crm_booking_items").select(ITEM_SELECT).eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
  return (data || []) as ItemRow[];
}

function amountOf(row: ItemRow) {
  if (row.amount == null) return null;
  const value = Number(row.amount);
  return Number.isFinite(value) ? value : null;
}

/**
 * La ligne Dépense du dossier pour cette transaction Pliant : celle qui existe déjà, sinon une nouvelle,
 * pré-remplie avec le commerçant, le montant Pliant et la date. Une seule ligne par transaction.
 * Un remboursement (coût négatif) ne crée rien. Le grand livre suit ; un séjour caché ne débite pas.
 */
export async function ensurePliantExpenseItem(
  admin: SupabaseClient,
  bookingId: string,
  draft: Pick<TripCostDraft, "sourceId" | "amountEur" | "supplier" | "occurredOn">
): Promise<{ itemId: string; created: boolean } | null> {
  const expense = pliantExpenseDraft(draft);
  if (!expense) return null;
  const rows = await bookingItems(admin, bookingId);
  const existing = findPliantExpenseItem(rows, draft.sourceId);
  if (existing) return { itemId: existing.id, created: false };
  const maxSort = rows.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const { data, error } = await admin
    .from("crm_booking_items")
    .insert({
      booking_id: bookingId,
      kind: "expense",
      title: expense.title,
      amount: expense.amount,
      start_at: expense.start_at,
      include_in_ledger: true,
      sort_order: maxSort + 1,
      details: expense.details,
      visible_to_client: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "La dépense n’a pas pu être créée.");
  await refreshBookingLedger(admin, bookingId);
  return { itemId: String(data.id), created: true };
}

/**
 * Le règlement Pliant a bougé le montant : la ligne non touchée par l’agence suit. Une ligne modifiée
 * garde son montant. Renvoie vrai si la ligne a changé.
 */
export async function syncPliantExpenseItem(
  admin: SupabaseClient,
  bookingId: string,
  draft: Pick<TripCostDraft, "sourceId" | "amountEur" | "supplier" | "occurredOn">
) {
  const rows = await bookingItems(admin, bookingId);
  const item = findPliantExpenseItem(rows, draft.sourceId);
  if (!item) return { itemId: null, changed: false };
  const patch = pliantExpenseSyncPatch({ amount: amountOf(item), details: item.details }, draft);
  if (!patch) return { itemId: item.id, changed: false };
  const { error } = await admin.from("crm_booking_items").update(patch).eq("id", item.id).eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
  await refreshBookingLedger(admin, bookingId);
  return { itemId: item.id, changed: true };
}

/**
 * Retire la ligne Dépense née de cette transaction, si l’agence ne l’a pas modifiée
 * (autorisation refusée, dépense déplacée vers un autre dossier). Renvoie vrai si une ligne est partie.
 */
export async function removePliantExpenseItem(admin: SupabaseClient, bookingId: string, transactionId: string) {
  const rows = await bookingItems(admin, bookingId);
  const item = findPliantExpenseItem(rows, transactionId);
  if (!item || !pliantExpenseRemovable({ amount: amountOf(item), details: item.details })) return false;
  const { error } = await admin.from("crm_booking_items").delete().eq("id", item.id).eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
  await refreshBookingLedger(admin, bookingId);
  return true;
}
