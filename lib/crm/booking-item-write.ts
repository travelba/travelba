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
import { readMb3mActivityOverride, withMb3mActivity } from "@/lib/crm/mb3m-activity";
import { applyExpensePricing, hasExpensePricingInput } from "@/lib/crm/expense-pricing";
import { awaitingExpenseDetails, validatedExpenseDetails } from "@/lib/crm/expense-validation";
import { linkedPliantTransactionIds, pliantExpenseTransactionId } from "@/lib/crm/pliant-booking";
import { parseMoney } from "@/lib/crm/money";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { composeAccueilVip, readAccueilVipFields, type AccueilVipFlight } from "@/lib/crm/accueil-vip";
import { BOOKING_ITEM_KINDS, isExtraItemKind, isLedgerExpenseKind, type BookingItemKind } from "@/lib/crm/types";
import { readCardPriceMode, withCardPriceMode, type CardPriceMode } from "@/lib/crm/card-price";
import { dbErrorMessage, type DbErrorLike } from "@/lib/crm/db-error";
import { missingDbColumn } from "@/lib/crm/optional-column";
import {
  DEFAULT_EXPENSE_PRESETS,
  TICKETING_PRESET_BLOCKED,
  ticketingPresetBlocked,
  type ExpensePreset,
} from "@/lib/crm/expense-presets";
import { loadExpensePresets } from "@/lib/crm/expense-presets-db";

const SORT_ORDER_ERROR = `Ordre de la carte invalide (0 à ${MAX_SORT_ORDER}).`;

/** La colonne suit le mode écrit dans les détails. Sans la colonne, l’écriture reprend sans elle. */
async function writeBookingItem(
  supabase: SupabaseClient,
  action: "insert" | "update",
  payload: Record<string, unknown>,
  where?: { id: string; bookingId: string }
) {
  const run = (row: Record<string, unknown>) => {
    if (action === "insert") return supabase.from("crm_booking_items").insert(row).select("*").single();
    return supabase
      .from("crm_booking_items")
      .update(row)
      .eq("id", where?.id || "")
      .eq("booking_id", where?.bookingId || "")
      .select("*")
      .single();
  };
  const first = await run(payload);
  if (first.error && "price_mode" in payload && missingDbColumn(first.error, "price_mode")) {
    const next = { ...payload };
    delete next.price_mode;
    return run(next);
  }
  return first;
}

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
  let amount = parseMoney(moneyField(body.amount));
  let expenseDetails: Record<string, unknown> | null = null;
  if (isLedgerExpenseKind(kind)) {
    const parsedDetails = parseItemDetails(body.details);
    if ("error" in parsedDetails) return { error: parsedDetails.error, status: 400 };
    const priced = applyExpensePricing(
      { quantity: body.quantity, unit_price: body.unit_price, amount: body.amount },
      { amount: null, details: parsedDetails.details }
    );
    if (!priced.ok) return { error: priced.error === "Montant requis." ? "Montant requis" : priced.error, status: 400 };
    amount = priced.pricing.amount;
    expenseDetails = priced.details;
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
  let nextDetails = expenseDetails ?? details.details;
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
  if (isLedgerExpenseKind(kind)) {
    const expenseTitle = String(nextBody.title || title).trim();
    let catalog: readonly ExpensePreset[] = DEFAULT_EXPENSE_PRESETS;
    try {
      const loaded = await loadExpensePresets(supabase);
      if (loaded.source === "table") catalog = loaded.presets;
    } catch {
      catalog = DEFAULT_EXPENSE_PRESETS;
    }
    if (ticketingPresetBlocked(catalog, expenseTitle, rows)) {
      return { error: TICKETING_PRESET_BLOCKED, status: 409 };
    }
  }
  const stayCard = !isLedgerExpenseKind(kind) && !isExtraItemKind(kind);
  let columnMode: CardPriceMode | null = null;
  if (stayCard) {
    const mode = readCardPriceMode({ amount: nextAmount, details: nextDetails });
    const priced = mode === "avec" && Number(nextAmount) > 0;
    if (mode === "avec" && !priced) return { error: "Indiquez le prix de vente.", status: 400 };
    columnMode = priced ? "avec" : "sans";
    nextDetails = withCardPriceMode(nextDetails, columnMode);
  }
  const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
  if ("error" in company && company.error) return { error: company.error, status: 400 };
  const { data, error } = await writeBookingItem(supabase, "insert", {
    booking_id: bookingId,
    kind,
    title: String(nextBody.title || title).trim(),
    supplier: nextBody.supplier || null,
    confirmation_ref: nextBody.confirmation_ref || null,
    start_at: nextBody.start_at || null,
    end_at: nextBody.end_at || null,
    amount: nextAmount,
    include_in_ledger: stayCard
      ? columnMode === "avec"
      : isLedgerExpenseKind(kind)
        ? true
        : parseIncludeInLedger(body.include_in_ledger, false),
    sort_order: sortOrder,
    details: nextDetails,
    visible_to_client: false,
    ...(columnMode ? { price_mode: columnMode } : {}),
    ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
  });
  if (error || !data) return { error: dbErrorMessage(error as DbErrorLike, "Carte non créée."), status: 400 };
  if (kind === "hotel") {
    try {
      const { scheduleHotelWebEnrichment } = await import("@/lib/crm/hotel-web-schedule");
      scheduleHotelWebEnrichment(String(data.id));
    } catch (scheduleError) {
      console.warn("[hotel-web]", scheduleError instanceof Error ? scheduleError.message : "planification");
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
    .select("id, kind, amount, details")
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
  const row = current as { kind?: string | null; amount?: number | string | null; details?: unknown };
  if ("mb3m_activity" in body || "categorie_mb3m" in body) {
    const chosen = withMb3mActivity("details" in patch ? patch.details : row.details, body.mb3m_activity ?? body.categorie_mb3m);
    if ("error" in chosen) return { error: chosen.error, status: 400 };
    patch.details = chosen.details;
  } else if ("details" in patch) {
    const kept = readMb3mActivityOverride(row.details);
    const next = patch.details;
    if (kept && next && typeof next === "object" && !Array.isArray(next) && !("mb3m_activity" in next)) {
      patch.details = { ...(next as Record<string, unknown>), mb3m_activity: "land" };
    }
  }
  if (isLedgerExpenseKind(row.kind) && typeof body.validate === "boolean") {
    const base = "details" in patch ? patch.details : row.details;
    patch.details = body.validate ? validatedExpenseDetails(base) : awaitingExpenseDetails(base);
  }
  if (isLedgerExpenseKind(row.kind) && ("amount" in body || "details" in body || hasExpensePricingInput(body) || typeof body.validate === "boolean")) {
    // Dépense : quantité × prix unitaire, le montant suit. Le montant seul recalcule le prix unitaire.
    const priced = applyExpensePricing(
      { quantity: body.quantity, unit_price: body.unit_price, amount: "amount" in body ? body.amount : undefined },
      { amount: parseMoney(row.amount), details: "details" in patch ? patch.details : row.details }
    );
    if (!priced.ok) return { error: priced.error === "Montant requis." ? "Montant requis" : priced.error, status: 400 };
    patch.amount = priced.pricing.amount;
    patch.details = priced.details;
    patch.include_in_ledger = true;
  }
  if (!isLedgerExpenseKind(row.kind) && !isExtraItemKind(row.kind)) {
    const details = (
      patch.details && typeof patch.details === "object" ? patch.details : row.details
    ) as Record<string, unknown> | null;
    const amount = "amount" in patch ? (patch.amount as number | null) : parseMoney(row.amount);
    const mode = readCardPriceMode({ amount, details });
    if ((("amount" in patch) || (details && details.price_mode === "avec") || (details && details.price_mode === "sans")) && mode === "avec" && !(Number(amount) > 0)) {
      return { error: "Indiquez le prix de vente.", status: 400 };
    }
    if ("amount" in patch || (details && (details.price_mode === "avec" || details.price_mode === "sans"))) {
      const stamped: CardPriceMode =
        mode === "avec" && Number(amount) > 0 ? "avec" : mode === "sans" ? "sans" : readCardPriceMode({ amount, details });
      patch.details = withCardPriceMode(details, stamped);
      patch.price_mode = stamped;
      patch.include_in_ledger = stamped === "avec";
    }
  }
  if (!Object.keys(patch).length) return { error: "Rien à mettre à jour", status: 400 };
  const { data, error } = await writeBookingItem(supabase, "update", patch, { id: itemId, bookingId });
  if (error || !data) return { error: dbErrorMessage(error as DbErrorLike, "Carte non modifiée."), status: 400 };
  if ("start_at" in body || "end_at" in body) {
    try {
      await persistBookingCardOrder(supabase, bookingId);
    } catch (orderError) {
      return { error: dbErrorMessage(orderError as DbErrorLike, "Ordre de la carte non enregistré."), status: 400 };
    }
  }
  const warning = await ledgerWarning("Modification enregistrée", () => refreshBookingLedger(supabase, bookingId));
  return { item: data as Record<string, unknown>, ledgerWarning: warning };
}
