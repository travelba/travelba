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
import { commissionForCardWrite } from "@/lib/crm/supplier-commission";
import { loadItemCommission, saveItemCommission } from "@/lib/crm/supplier-commission-db";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { composeAccueilVip, readAccueilVipFields, type AccueilVipFlight } from "@/lib/crm/accueil-vip";
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
  if (!title && kind !== "accueil_vip") return { error: "Titre requis", status: 400 };
  const amount = parseMoney(moneyField(body.amount));
  if (isLedgerExpenseKind(kind) && (amount == null || amount <= 0)) {
    return { error: "Montant requis", status: 400 };
  }
  const { data: existing, error: existingError } = await supabase
    .from("crm_booking_items")
    .select("id, sort_order, kind, title, start_at, end_at, lifecycle, details")
    .eq("booking_id", bookingId);
  if (existingError) return { error: dbErrorMessage(existingError as DbErrorLike, "Carte non créée."), status: 400 };
  const rows = (existing || []) as {
    id?: string;
    sort_order?: number | null;
    kind?: string | null;
    title?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    lifecycle?: string | null;
    details?: Record<string, unknown> | null;
  }[];
  const maxSort = rows.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const sortOrder = body.sort_order == null || body.sort_order === "" ? maxSort + 1 : parseSortOrder(body.sort_order);
  if (sortOrder == null) return { error: SORT_ORDER_ERROR, status: 400 };
  const details = parseItemDetails(body.details);
  if ("error" in details) return { error: details.error, status: 400 };
  let nextBody = body;
  let nextDetails = details.details;
  let nextAmount = amount;
  if (kind === "accueil_vip") {
    const composed = composeAccueilVip(
      readAccueilVipFields({
        supplier: typeof body.supplier === "string" ? body.supplier : null,
        confirmation_ref: typeof body.confirmation_ref === "string" ? body.confirmation_ref : null,
        amount,
        details: details.details,
      }),
      rows as AccueilVipFlight[]
    );
    if (!composed.ok) return { error: composed.error, status: 400 };
    nextBody = {
      ...body,
      title: composed.card.title,
      supplier: composed.card.supplier,
      confirmation_ref: composed.card.confirmation_ref,
      start_at: composed.card.start_at,
      end_at: composed.card.end_at,
    };
    nextAmount = composed.card.amount;
    nextDetails = { ...details.details, ...composed.card.details };
  }
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
  const commission = commissionForCardWrite(body, nextDetails, String(nextBody.end_at || ""));
  if ("error" in commission) return { error: commission.error, status: 400 };
  nextDetails = commission.details;
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: bookingId,
      kind,
      title: String(nextBody.title || title).trim(),
      supplier: nextBody.supplier || null,
      confirmation_ref: nextBody.confirmation_ref || null,
      start_at: nextBody.start_at || null,
      end_at: nextBody.end_at || null,
      amount: nextAmount,
      include_in_ledger:
        isLedgerExpenseKind(kind) || (kind === "accueil_vip" && nextAmount == null)
          ? isLedgerExpenseKind(kind)
          : parseIncludeInLedger(body.include_in_ledger, false),
      sort_order: sortOrder,
      details: nextDetails,
      visible_to_client: false,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("*")
    .single();
  if (error || !data) return { error: dbErrorMessage(error as DbErrorLike, "Carte non créée."), status: 400 };
  if (Object.keys(commission.columns).length) {
    try {
      await saveItemCommission(supabase, String(data.id), commission.columns);
      Object.assign(data, commission.columns);
    } catch (commissionError) {
      return {
        error: commissionError instanceof Error ? commissionError.message : "Commission non enregistrée.",
        status: 400,
      };
    }
  }
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

/**
 * Corrige une carte déjà au dossier. Ne change pas la visibilité et n’envoie rien.
 * Le grand livre est recalculé ; un séjour caché ne débite pas.
 */
export async function patchStaffBookingCard(
  supabase: SupabaseClient,
  bookingId: string,
  itemId: string,
  body: Record<string, unknown>
): Promise<{ item: Record<string, unknown>; ledgerWarning: string | null } | { error: string; status: number }> {
  const { data: current, error: currentError } = await supabase
    .from("crm_booking_items")
    .select("*")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (currentError) return { error: dbErrorMessage(currentError as DbErrorLike, "Carte introuvable."), status: 400 };
  if (!current) return { error: "Carte introuvable", status: 404 };
  const patch: Record<string, unknown> = {};
  if ("title" in body) patch.title = body.title;
  if ("supplier" in body) patch.supplier = body.supplier;
  if ("confirmation_ref" in body) patch.confirmation_ref = body.confirmation_ref;
  if ("start_at" in body) patch.start_at = body.start_at;
  if ("end_at" in body) patch.end_at = body.end_at;
  if ("amount" in body) patch.amount = parseMoney(moneyField(body.amount));
  if ("details" in body) {
    const details = parseItemDetails(body.details);
    if ("error" in details) return { error: details.error, status: 400 };
    patch.details = details.details;
  }
  const endAt = "end_at" in patch ? patch.end_at : current.end_at;
  const commission = commissionForCardWrite(
    body,
    (patch.details as Record<string, unknown> | undefined) ||
      (current.details && typeof current.details === "object" ? (current.details as Record<string, unknown>) : {}),
    typeof endAt === "string" ? endAt : null,
    await loadItemCommission(supabase, itemId)
  );
  if ("error" in commission) return { error: commission.error, status: 400 };
  if ("details" in body) patch.details = commission.details;
  const commissionColumns = commission.columns;
  if (!Object.keys(patch).length && !Object.keys(commissionColumns).length) {
    return { error: "Rien à mettre à jour", status: 400 };
  }
  let data: Record<string, unknown> = current as Record<string, unknown>;
  if (Object.keys(patch).length) {
    const updated = await supabase
      .from("crm_booking_items")
      .update(patch)
      .eq("id", itemId)
      .eq("booking_id", bookingId)
      .select("*")
      .single();
    if (updated.error || !updated.data) {
      return { error: dbErrorMessage(updated.error as DbErrorLike, "Carte non modifiée."), status: 400 };
    }
    data = updated.data as Record<string, unknown>;
  }
  if (Object.keys(commissionColumns).length) {
    try {
      await saveItemCommission(supabase, itemId, commissionColumns);
      Object.assign(data, commissionColumns);
    } catch (commissionError) {
      return {
        error: commissionError instanceof Error ? commissionError.message : "Commission non enregistrée.",
        status: 400,
      };
    }
  }
  if ("start_at" in body || "end_at" in body) {
    try {
      await persistBookingCardOrder(supabase, bookingId);
    } catch (orderError) {
      return { error: dbErrorMessage(orderError as DbErrorLike, "Ordre de la carte non enregistré."), status: 400 };
    }
  }
  const warning = await ledgerWarning("Modification enregistrée", () => refreshBookingLedger(supabase, bookingId));
  return { item: data, ledgerWarning: warning };
}
