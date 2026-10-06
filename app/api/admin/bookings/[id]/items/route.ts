import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
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
import { BOOKING_ITEM_KINDS, isActiveItem, isLedgerExpenseKind, type BookingItemKind } from "@/lib/crm/types";

function knownKind(value: unknown) {
  const kind = String(value || "");
  return (BOOKING_ITEM_KINDS as readonly string[]).includes(kind) ? (kind as BookingItemKind) : null;
}

function moneyField(value: unknown) {
  if (typeof value === "number" || typeof value === "string") return value;
  return null;
}

type Ctx = { params: Promise<{ id: string }> };

const SORT_ORDER_ERROR = `Ordre de la carte invalide (0 à ${MAX_SORT_ORDER}).`;

/** L’écriture est faite ; un grand livre refusé devient `ledger_warning` (200), pas une erreur à rejouer. */
async function ledgerAfterItemWrite(supabase: SupabaseClient, bookingId: string, saved: string) {
  const warning = await ledgerWarning(saved, () => refreshBookingLedger(supabase, bookingId));
  return warning ? { ledger_warning: warning } : {};
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

async function insertBookingItem(
  supabase: SupabaseClient,
  bookingId: string,
  body: Record<string, unknown>,
  sortOrder: number
) {
  const title = String(body.title || "").trim();
  const kind = knownKind(body.kind || "fee");
  if (!kind) return { error: jsonError("Type de carte inconnu") };
  if (!title) return { error: jsonError("Titre requis") };
  const amount = parseMoney(moneyField(body.amount));
  if (isLedgerExpenseKind(kind) && (amount == null || amount <= 0)) {
    return { error: jsonError("Montant requis") };
  }
  const details = parseItemDetails(body.details);
  if ("error" in details) return { error: jsonError(details.error) };
  const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
  if ("error" in company && company.error) return { error: jsonError(company.error) };
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
      include_in_ledger: isLedgerExpenseKind(kind)
        ? true
        : parseIncludeInLedger(body.include_in_ledger, false),
      sort_order: sortOrder,
      details: details.details,
      visible_to_client: body.visible_to_client === true,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error, 400) };
  return { id: String(data.id) };
}

async function updateBookingItem(
  supabase: SupabaseClient,
  bookingId: string,
  body: Record<string, unknown>
) {
  const itemId = String(body.id || "");
  if (!itemId) return { error: jsonError("id requis") };
  const { data: current, error: currentError } = await supabase
    .from("crm_booking_items")
    .select("kind, amount, details, lifecycle")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (currentError) return { error: dbError(currentError, 400) };
  if (!current) return { error: jsonError("Carte introuvable", 404) };
  const nextKind = body.kind != null ? knownKind(body.kind) : knownKind(current.kind);
  if (!nextKind) return { error: jsonError("Type de carte inconnu") };
  const patch: Record<string, unknown> = {};
  if (body.kind != null) patch.kind = nextKind;
  if (body.title != null) patch.title = body.title;
  if ("supplier" in body) patch.supplier = body.supplier;
  if ("confirmation_ref" in body) patch.confirmation_ref = body.confirmation_ref;
  if ("start_at" in body) patch.start_at = body.start_at;
  if ("end_at" in body) patch.end_at = body.end_at;
  if ("amount" in body) patch.amount = parseMoney(moneyField(body.amount));
  if ("include_in_ledger" in body) {
    patch.include_in_ledger = parseIncludeInLedger(body.include_in_ledger, false);
  }
  if (isLedgerExpenseKind(nextKind)) {
    const amount = "amount" in body ? parseMoney(moneyField(body.amount)) : parseMoney(current.amount);
    if (amount == null || amount <= 0) return { error: jsonError("Montant requis") };
    patch.include_in_ledger = true;
    if ("amount" in body) patch.amount = amount;
  }
  if (body.sort_order != null) {
    const sortOrder = parseSortOrder(body.sort_order);
    if (sortOrder == null) return { error: jsonError(SORT_ORDER_ERROR) };
    patch.sort_order = sortOrder;
  }
  if ("details" in body) {
    const details = parseItemDetails(body.details);
    if ("error" in details) return { error: jsonError(details.error) };
    patch.details = details.details;
  }
  if ("visible_to_client" in body) {
    const visible = Boolean(body.visible_to_client);
    if (visible && !isActiveItem(current)) {
      return { error: jsonError("Cette carte est archivée. Elle ne revient pas dans le carnet.") };
    }
    patch.visible_to_client = visible;
    const base =
      patch.details && typeof patch.details === "object"
        ? (patch.details as Record<string, unknown>)
        : ((current.details as Record<string, unknown> | null) || {});
    const details = { ...base };
    if (visible) delete details.client_hidden;
    else details.client_hidden = true;
    patch.details = details;
  }
  if ("billing_company_id" in body) {
    const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
    if ("error" in company && company.error) return { error: jsonError(company.error) };
    if ("billing_company_id" in company) patch.billing_company_id = company.billing_company_id;
  }
  if (!Object.keys(patch).length) return { error: jsonError("Rien à mettre à jour") };
  const { data, error } = await supabase
    .from("crm_booking_items")
    .update(patch)
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .select("*")
    .single();
  if (error) return { error: dbError(error, 400) };
  return { item: data };
}

/** Modifications et suppressions d’étapes : une seule écriture, au moment d’enregistrer le séjour. */
async function commitStaySteps(
  supabase: SupabaseClient,
  bookingId: string,
  body: Record<string, unknown>
) {
  const deleted = Array.isArray(body.deleted)
    ? body.deleted.map((value) => String(value || "")).filter(Boolean)
    : [];
  const updated = Array.isArray(body.updated) ? body.updated : [];
  const created = Array.isArray(body.created) ? body.created : [];
  const order = Array.isArray(body.order)
    ? body.order.map((value) => String(value || "")).filter(Boolean)
    : [];
  if (order.length > MAX_SORT_ORDER + 1) return jsonError(SORT_ORDER_ERROR);

  for (const item of updated) {
    if (!item || typeof item !== "object") return jsonError("Étape invalide");
    const failed = await updateBookingItem(supabase, bookingId, item as Record<string, unknown>);
    if ("error" in failed) return failed.error;
  }
  if (deleted.length) {
    const { error } = await supabase
      .from("crm_booking_items")
      .delete()
      .in("id", deleted)
      .eq("booking_id", bookingId);
    if (error) return dbError(error, 400);
  }
  const idMap = new Map<string, string>();
  for (const [index, item] of created.entries()) {
    if (!item || typeof item !== "object") return jsonError("Étape invalide");
    const row = item as Record<string, unknown>;
    const inserted = await insertBookingItem(supabase, bookingId, row, order.length + index);
    if ("error" in inserted) return inserted.error;
    idMap.set(String(row.client_id || ""), inserted.id);
  }
  try {
    await persistBookingCardOrder(supabase, bookingId, {
      createdIds: [...idMap.values()],
      submittedIds: order.length ? order.map((id) => idMap.get(id) || id) : null,
    });
  } catch (error) {
    return dbError(error as { message?: string; code?: string }, 400);
  }
  scheduleFormalitySync(bookingId);
  return NextResponse.json({
    ok: true,
    ids: Object.fromEntries(idMap),
    ...(await ledgerAfterItemWrite(supabase, bookingId, "Séjour enregistré")),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (body?.commit === true) return commitStaySteps(auth.supabase, id, body);
  const title = String(body?.title || "").trim();
  const kind = knownKind(body?.kind || "fee");
  if (!kind) return jsonError("Type de carte inconnu");
  if (!title) return jsonError("Titre requis");
  const amount = parseMoney(body?.amount);
  if (isLedgerExpenseKind(kind) && (amount == null || amount <= 0)) {
    return jsonError("Montant requis");
  }
  const { data: existing } = await auth.supabase
    .from("crm_booking_items")
    .select("sort_order, kind, lifecycle, details")
    .eq("booking_id", id);
  const maxSort = (existing || []).reduce(
    (max, row) => Math.max(max, Number(row.sort_order || 0)),
    -1
  );
  const sortOrder =
    body?.sort_order == null || body.sort_order === "" ? maxSort + 1 : parseSortOrder(body.sort_order);
  if (sortOrder == null) return jsonError(SORT_ORDER_ERROR);
  const details = parseItemDetails(body?.details);
  if ("error" in details) return jsonError(details.error);
  const txId = isLedgerExpenseKind(kind) ? pliantExpenseTransactionId(details.details) : null;
  if (txId && linkedPliantTransactionIds(existing || []).has(txId)) {
    return jsonError("Cette dépense est déjà au dossier.", 409);
  }
  const company = await billingCompanyPatch(auth.supabase, id, body?.billing_company_id);
  if ("error" in company && company.error) return jsonError(company.error);
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .insert({
      booking_id: id,
      kind,
      title,
      supplier: body?.supplier || null,
      confirmation_ref: body?.confirmation_ref || null,
      start_at: body?.start_at || null,
      end_at: body?.end_at || null,
      amount,
      include_in_ledger: isLedgerExpenseKind(kind)
        ? true
        : parseIncludeInLedger(body?.include_in_ledger, false),
      sort_order: sortOrder,
      details: details.details,
      visible_to_client: false,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  if (!isLedgerExpenseKind(kind)) {
    try {
      await persistBookingCardOrder(auth.supabase, id, { createdIds: [String(data.id)] });
    } catch (orderError) {
      return dbError(orderError as { message?: string; code?: string }, 400);
    }
  }
  scheduleFormalitySync(id);
  return NextResponse.json({ item: data, ...(await ledgerAfterItemWrite(auth.supabase, id, "Ajout enregistré")) });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: bookingId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (Array.isArray(body?.order)) {
    const order = body.order.map((value: unknown) => String(value || "")).filter(Boolean);
    if (order.length > MAX_SORT_ORDER + 1) return jsonError(SORT_ORDER_ERROR);
    try {
      await persistBookingCardOrder(auth.supabase, bookingId, { submittedIds: order });
    } catch (error) {
      return dbError(error as { message?: string; code?: string }, 400);
    }
    return NextResponse.json({ ok: true });
  }
  const updated = await updateBookingItem(auth.supabase, bookingId, body || {});
  if ("error" in updated) return updated.error;
  const moved =
    body?.start_at !== undefined || body?.kind !== undefined;
  if (moved) {
    try {
      await persistBookingCardOrder(auth.supabase, bookingId);
    } catch (error) {
      return dbError(error as { message?: string; code?: string }, 400);
    }
  }
  scheduleFormalitySync(bookingId);
  return NextResponse.json({
    item: updated.item,
    ...(await ledgerAfterItemWrite(auth.supabase, bookingId, "Modification enregistrée")),
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: bookingId } = await ctx.params;
  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) return jsonError("itemId requis");
  const { error } = await auth.supabase
    .from("crm_booking_items")
    .delete()
    .eq("id", itemId)
    .eq("booking_id", bookingId);
  if (error) return dbError(error, 400);
  scheduleFormalitySync(bookingId);
  return NextResponse.json({
    ok: true,
    ...(await ledgerAfterItemWrite(auth.supabase, bookingId, "Suppression enregistrée")),
  });
}

function scheduleFormalitySync(bookingId: string) {
  after(() => Promise.all([touchEsta(bookingId), touchUkEta(bookingId)]));
}

async function touchEsta(bookingId: string) {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { syncEstaForBookingId } = await import("@/lib/crm/esta-run");
    await syncEstaForBookingId(createServiceClient(), bookingId);
  } catch {
    console.info("[esta] synchro dossier ignorée");
  }
}

async function touchUkEta(bookingId: string) {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { syncUkEtaForBookingId } = await import("@/lib/crm/uk-eta-run");
    await syncUkEtaForBookingId(createServiceClient(), bookingId);
  } catch {
    console.info("[uk-eta] synchro dossier ignorée");
  }
}
