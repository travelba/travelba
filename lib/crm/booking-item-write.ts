import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBillingCompanyId } from "@/lib/crm/billing-companies";
import {
  ledgerWarning,
  MAX_SORT_ORDER,
  parseIncludeInLedger,
  parseSortOrder,
  refreshBookingLedger,
} from "@/lib/crm/bookings";
import { parseItemDetails } from "@/lib/crm/ingest-types";
import { linkedPliantTransactionIds, pliantExpenseTransactionId } from "@/lib/crm/pliant-booking";
import { parseMoney } from "@/lib/crm/money";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { BOOKING_ITEM_KINDS, isLedgerExpenseKind, type BookingItemKind } from "@/lib/crm/types";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";

const SORT_ORDER_ERROR = `Ordre de la carte invalide (0 à ${MAX_SORT_ORDER}).`;

function knownKind(value: unknown) {
  const kind = String(value || "");
  return (BOOKING_ITEM_KINDS as readonly string[]).includes(kind) ? (kind as BookingItemKind) : null;
}

function moneyField(value: unknown) {
  if (typeof value === "number" || typeof value === "string") return value;
  return null;
}

async function billingCompanyPatch(supabase: SupabaseClient, bookingId: string, value: unknown) {
  if (value === undefined) return {};
  const parsed = parseBillingCompanyId(value);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.id) return { billing_company_id: null };
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("customer_id, billing_customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  const payerId = booking?.billing_customer_id || booking?.customer_id;
  if (!payerId) return { error: "Séjour introuvable" };
  const { data: company } = await supabase
    .from("crm_billing_companies")
    .select("id")
    .eq("id", parsed.id)
    .eq("customer_id", payerId)
    .maybeSingle();
  if (!company) return { error: "Cette société n’est pas sur le compte facturé." };
  return { billing_company_id: parsed.id };
}

/**
 * POST carte de l’agence : une carte cachée, ordre chrono, grand livre.
 * Le débit ne part pas tant que le séjour n’est pas montré.
 */
export async function addStaffBookingCard(
  supabase: SupabaseClient,
  bookingId: string,
  body: Record<string, unknown>
): Promise<{ item: Record<string, unknown>; ledgerWarning: string | null } | { error: string; status: number }> {
  const title = String(body.title || "").trim();
  const kind = knownKind(body.kind || "fee");
  if (!kind) return { error: "Type de carte inconnu", status: 400 };
  if (!title) return { error: "Titre requis", status: 400 };
  const amount = parseMoney(moneyField(body.amount));
  if (isLedgerExpenseKind(kind) && (amount == null || amount <= 0)) {
    return { error: "Montant requis", status: 400 };
  }
  const { data: existing, error: existingError } = await supabase
    .from("crm_booking_items")
    .select("sort_order, kind, lifecycle, details")
    .eq("booking_id", bookingId);
  if (existingError) return { error: dbErrorMessage(existingError as DbErrorLike, "Carte non créée."), status: 400 };
  const rows = (existing || []) as { sort_order?: number | null; kind?: string | null; lifecycle?: string | null; details?: Record<string, unknown> | null }[];
  const maxSort = rows.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const sortOrder = body.sort_order == null || body.sort_order === "" ? maxSort + 1 : parseSortOrder(body.sort_order);
  if (sortOrder == null) return { error: SORT_ORDER_ERROR, status: 400 };
  const details = parseItemDetails(body.details);
  if ("error" in details) return { error: details.error, status: 400 };
  const txId = isLedgerExpenseKind(kind) ? pliantExpenseTransactionId(details.details) : null;
  if (
    txId &&
    linkedPliantTransactionIds(
      rows.map((row) => ({ kind: row.kind ?? null, lifecycle: row.lifecycle, details: row.details }))
    ).has(txId)
  ) {
    return { error: "Cette dépense est déjà au dossier.", status: 409 };
  }
  const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
  if ("error" in company && company.error) return { error: company.error, status: 400 };
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: bookingId,
      kind,
      title,
      supplier: body.supplier || null,
      confirmation_ref: body.confirmation_ref || null,
      start_at: body.start_at || null,
      end_at: body.end_at || null,
      amount,
      include_in_ledger: isLedgerExpenseKind(kind) ? true : parseIncludeInLedger(body.include_in_ledger, false),
      sort_order: sortOrder,
      details: details.details,
      visible_to_client: false,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("*")
    .single();
  if (error || !data) return { error: dbErrorMessage(error as DbErrorLike, "Carte non créée."), status: 400 };
  if (!isLedgerExpenseKind(kind)) {
    try {
      await persistBookingCardOrder(supabase, bookingId, { createdIds: [String(data.id)] });
    } catch (orderError) {
      return { error: dbErrorMessage(orderError as DbErrorLike, "Ordre de la carte non enregistré."), status: 400 };
    }
  }
  const warning = await ledgerWarning("Ajout enregistré", () => refreshBookingLedger(supabase, bookingId));
  return { item: data as Record<string, unknown>, ledgerWarning: warning };
}
