import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { refreshBookingDerived } from "@/lib/crm/dossier-refresh";
import { hotelSignatoryName } from "@/lib/crm/hotel-desk";
import { parseBillingCompanyId } from "@/lib/crm/billing-companies";
import {
  ledgerWarning,
  MAX_SORT_ORDER,
  parseIncludeInLedger,
  parseSortOrder,
  refreshBookingLedger,
} from "@/lib/crm/bookings";
import { noteCarnetAdditions, type CarnetAdditionCard } from "@/lib/crm/carnet-addition";
import { detailsForCardVisibility, keptHiddenFromClient } from "@/lib/crm/carnet";
import { parseItemDetails } from "@/lib/crm/ingest-types";
import { parseMoney } from "@/lib/crm/money";
import { commissionForCardWrite } from "@/lib/crm/supplier-commission";
import { loadItemCommission, saveItemCommission } from "@/lib/crm/supplier-commission-db";
import { addStaffBookingCard } from "@/lib/crm/booking-item-write";
import { persistBookingCardOrder } from "@/lib/crm/item-order";
import { isAutoTicketingExpense, TICKETING_FEE_OFF } from "@/lib/crm/ticketing-fee";
import { composeAccueilVip, readAccueilVipFields, type AccueilVipFlight } from "@/lib/crm/accueil-vip";
import { resyncAccueilVip } from "@/lib/crm/accueil-vip-sync";
import { BOOKING_ITEM_KINDS, countsAsCarnetCard, isActiveItem, isLedgerExpenseKind, type BookingItemKind } from "@/lib/crm/types";

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
  revalidatePath(`/admin/reservations/${bookingId}`);
  revalidatePath("/admin/transactions");
  revalidatePath("/mon-compte/transactions");
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

async function dossierFlights(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase
    .from("crm_booking_items")
    .select("id, kind, title, start_at, end_at, lifecycle, details")
    .eq("booking_id", bookingId)
    .eq("kind", "flight");
  if (error) return { error: "Vols du dossier illisibles." };
  return { flights: (data || []) as AccueilVipFlight[] };
}

function frozenAccueilVip(
  flights: AccueilVipFlight[],
  source: {
    supplier?: unknown;
    confirmation_ref?: unknown;
    amount?: unknown;
    details?: unknown;
  }
) {
  const details =
    source.details && typeof source.details === "object" && !Array.isArray(source.details)
      ? (source.details as Record<string, unknown>)
      : {};
  const amount = parseMoney(moneyField(source.amount));
  const composed = composeAccueilVip(
    readAccueilVipFields({
      supplier: typeof source.supplier === "string" ? source.supplier : null,
      confirmation_ref: typeof source.confirmation_ref === "string" ? source.confirmation_ref : null,
      amount,
      details,
    }),
    flights
  );
  if (!composed.ok) return composed;
  return {
    ok: true as const,
    card: {
      ...composed.card,
      details: { ...details, ...composed.card.details },
      include_in_ledger: composed.card.amount == null ? false : undefined,
    },
  };
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
  if (!title && kind !== "accueil_vip") return { error: jsonError("Titre requis") };
  const amount = parseMoney(moneyField(body.amount));
  if (isLedgerExpenseKind(kind) && (amount == null || amount <= 0)) {
    return { error: jsonError("Montant requis") };
  }
  const details = parseItemDetails(body.details);
  if ("error" in details) return { error: jsonError(details.error) };
  let titleForInsert = title;
  let supplier = body.supplier || null;
  let confirmation = body.confirmation_ref || null;
  let startAt = body.start_at || null;
  let endAt = body.end_at || null;
  let amountForInsert = amount;
  let detailsForInsert = details.details;
  let ledger = isLedgerExpenseKind(kind) ? true : parseIncludeInLedger(body.include_in_ledger, false);
  if (kind === "accueil_vip") {
    const loaded = await dossierFlights(supabase, bookingId);
    if ("error" in loaded) return { error: jsonError(loaded.error || "Vols du dossier illisibles.") };
    const frozen = frozenAccueilVip(loaded.flights, { ...body, amount, details: details.details });
    if (!frozen.ok) return { error: jsonError(frozen.error) };
    titleForInsert = frozen.card.title;
    supplier = frozen.card.supplier;
    confirmation = frozen.card.confirmation_ref;
    startAt = frozen.card.start_at;
    endAt = frozen.card.end_at;
    amountForInsert = frozen.card.amount;
    detailsForInsert = frozen.card.details;
    if (frozen.card.amount == null) ledger = false;
  }
  const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
  if ("error" in company && company.error) return { error: jsonError(company.error) };
  const commission = commissionForCardWrite(body, detailsForInsert, typeof endAt === "string" ? endAt : null);
  if ("error" in commission) return { error: jsonError(commission.error) };
  detailsForInsert = commission.details;
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: bookingId,
      kind,
      title: titleForInsert,
      supplier,
      confirmation_ref: confirmation,
      start_at: startAt,
      end_at: endAt,
      amount: amountForInsert,
      include_in_ledger: ledger,
      sort_order: sortOrder,
      details: detailsForInsert,
      visible_to_client: body.visible_to_client === true,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error, 400) };
  const id = String(data.id);
  if (Object.keys(commission.columns).length) {
    try {
      await saveItemCommission(supabase, id, commission.columns);
    } catch (commissionError) {
      return { error: jsonError(commissionError instanceof Error ? commissionError.message : "Commission non enregistrée.") };
    }
  }
  const shown = body.visible_to_client === true && countsAsCarnetCard(kind) ? { id, kind } : null;
  return { id, shown };
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
    .select("kind, amount, details, lifecycle, supplier, confirmation_ref, start_at, end_at, visible_to_client")
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
    if (visible) {
      const base =
        patch.details && typeof patch.details === "object"
          ? (patch.details as Record<string, unknown>)
          : ((current.details as Record<string, unknown> | null) || {});
      patch.details = detailsForCardVisibility(base, true);
    }
  }
  if ("billing_company_id" in body) {
    const company = await billingCompanyPatch(supabase, bookingId, body.billing_company_id);
    if ("error" in company && company.error) return { error: jsonError(company.error) };
    if ("billing_company_id" in company) patch.billing_company_id = company.billing_company_id;
  }
  if (nextKind === "accueil_vip") {
    const loaded = await dossierFlights(supabase, bookingId);
    if ("error" in loaded) return { error: jsonError(loaded.error || "Vols du dossier illisibles.") };
    const frozen = frozenAccueilVip(loaded.flights, {
      supplier: "supplier" in patch ? patch.supplier : current.supplier,
      confirmation_ref: "confirmation_ref" in patch ? patch.confirmation_ref : current.confirmation_ref,
      amount: "amount" in patch ? patch.amount : current.amount,
      details: "details" in patch ? patch.details : current.details,
    });
    if (!frozen.ok) return { error: jsonError(frozen.error) };
    patch.title = frozen.card.title;
    patch.supplier = frozen.card.supplier;
    patch.confirmation_ref = frozen.card.confirmation_ref;
    patch.start_at = frozen.card.start_at;
    patch.end_at = frozen.card.end_at;
    patch.amount = frozen.card.amount;
    patch.details = frozen.card.details;
    if (frozen.card.amount == null) patch.include_in_ledger = false;
  }
  const commissionEnd = "end_at" in patch ? patch.end_at : current.end_at;
  const commission = commissionForCardWrite(
    body,
    patch.details && typeof patch.details === "object"
      ? (patch.details as Record<string, unknown>)
      : current.details && typeof current.details === "object"
        ? (current.details as Record<string, unknown>)
        : {},
    typeof commissionEnd === "string" ? commissionEnd : null,
    await loadItemCommission(supabase, itemId)
  );
  if ("error" in commission) return { error: jsonError(commission.error) };
  if ("details" in body) patch.details = commission.details;
  if (!Object.keys(patch).length && !Object.keys(commission.columns).length) {
    return { error: jsonError("Rien à mettre à jour") };
  }
  let data: Record<string, unknown> | null = null;
  if (Object.keys(patch).length) {
    const updated = await supabase
      .from("crm_booking_items")
      .update(patch)
      .eq("id", itemId)
      .eq("booking_id", bookingId)
      .select("*")
      .single();
    if (updated.error) return { error: dbError(updated.error, 400) };
    data = updated.data as Record<string, unknown>;
  }
  if (Object.keys(commission.columns).length) {
    try {
      await saveItemCommission(supabase, itemId, commission.columns);
    } catch (commissionError) {
      return { error: jsonError(commissionError instanceof Error ? commissionError.message : "Commission non enregistrée.") };
    }
  }
  const wasHidden =
    current.visible_to_client !== true ||
    keptHiddenFromClient(
      current.details && typeof current.details === "object" ? (current.details as Record<string, unknown>) : null
    );
  const shown =
    "visible_to_client" in body && Boolean(body.visible_to_client) && wasHidden && countsAsCarnetCard(nextKind)
      ? { id: itemId, kind: nextKind }
      : null;
  return { item: data, shown };
}

/** Modifications et suppressions d’étapes : une seule écriture, au moment d’enregistrer le séjour. */
async function commitStaySteps(
  supabase: SupabaseClient,
  bookingId: string,
  body: Record<string, unknown>,
  signatory?: string
) {
  const shown: CarnetAdditionCard[] = [];
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
    if (failed.shown) shown.push(failed.shown);
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
    if (inserted.shown) shown.push(inserted.shown);
  }
  try {
    await persistBookingCardOrder(supabase, bookingId, {
      createdIds: [...idMap.values()],
      submittedIds: order.length ? order.map((id) => idMap.get(id) || id) : null,
    });
  } catch (error) {
    return dbError(error as { message?: string; code?: string }, 400);
  }
  try {
    await resyncAccueilVip(supabase, bookingId);
  } catch (error) {
    return dbError(error as { message?: string; code?: string }, 400);
  }
  await refreshBookingDerived(bookingId, { signatory });
  await noteCarnetAdditions(supabase, bookingId, shown);
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
  if (body?.commit === true) {
    return commitStaySteps(auth.supabase, id, body, hotelSignatoryName(auth.staff.full_name));
  }
  const saved = await addStaffBookingCard(auth.supabase, id, (body || {}) as Record<string, unknown>);
  if ("error" in saved) return jsonError(saved.error, saved.status);
  await refreshBookingDerived(id, { signatory: hotelSignatoryName(auth.staff.full_name) });
  revalidatePath(`/admin/reservations/${id}`);
  revalidatePath("/admin/transactions");
  revalidatePath("/mon-compte/transactions");
  return NextResponse.json({
    item: saved.item,
    ...(saved.ledgerWarning ? { ledger_warning: saved.ledgerWarning } : {}),
  });
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
  if (updated.shown) await noteCarnetAdditions(auth.supabase, bookingId, [updated.shown]);
  const moved =
    body?.start_at !== undefined || body?.kind !== undefined;
  if (moved) {
    try {
      await persistBookingCardOrder(auth.supabase, bookingId);
    } catch (error) {
      return dbError(error as { message?: string; code?: string }, 400);
    }
  }
  if (body?.kind === "flight" || body?.kind === "accueil_vip" || body?.start_at !== undefined || body?.end_at !== undefined || body?.details !== undefined) {
    try {
      await resyncAccueilVip(auth.supabase, bookingId);
    } catch (error) {
      return dbError(error as { message?: string; code?: string }, 400);
    }
  }
  await refreshBookingDerived(bookingId, { signatory: hotelSignatoryName(auth.staff.full_name) });
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
  const { data: current, error: lookupError } = await auth.supabase
    .from("crm_booking_items")
    .select("kind, details")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (lookupError) return dbError(lookupError, 400);
  if (current && isAutoTicketingExpense(current)) {
    const { error: modeError } = await auth.supabase
      .from("crm_bookings")
      .update({ fee_mode: TICKETING_FEE_OFF })
      .eq("id", bookingId);
    if (modeError) return dbError(modeError, 400);
  }
  const { error } = await auth.supabase
    .from("crm_booking_items")
    .delete()
    .eq("id", itemId)
    .eq("booking_id", bookingId);
  if (error) return dbError(error, 400);
  try {
    await resyncAccueilVip(auth.supabase, bookingId);
  } catch (syncError) {
    return dbError(syncError as { message?: string; code?: string }, 400);
  }
  await refreshBookingDerived(bookingId, { signatory: hotelSignatoryName(auth.staff.full_name) });
  return NextResponse.json({
    ok: true,
    ...(await ledgerAfterItemWrite(auth.supabase, bookingId, "Suppression enregistrée")),
  });
}
