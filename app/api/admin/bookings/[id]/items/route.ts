import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { parseBillingCompanyId } from "@/lib/crm/billing-companies";
import { parseIncludeInLedger, refreshBookingLedger } from "@/lib/crm/bookings";
import { parseMoney } from "@/lib/crm/money";
import { BOOKING_ITEM_KINDS, isLedgerExpenseKind, type BookingItemKind } from "@/lib/crm/types";

function knownKind(value: unknown) {
  const kind = String(value || "");
  return (BOOKING_ITEM_KINDS as readonly string[]).includes(kind) ? (kind as BookingItemKind) : null;
}

type Ctx = { params: Promise<{ id: string }> };

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

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
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
    .select("sort_order")
    .eq("booking_id", id);
  const maxSort = (existing || []).reduce(
    (max, row) => Math.max(max, Number(row.sort_order || 0)),
    -1
  );
  const sortOrder =
    body?.sort_order == null || body.sort_order === ""
      ? maxSort + 1
      : Number(body.sort_order);
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
      details: body?.details || {},
      visible_to_client: false,
      ...("billing_company_id" in company ? { billing_company_id: company.billing_company_id } : {}),
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  await refreshBookingLedger(auth.supabase, id);
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: bookingId } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (Array.isArray(body?.order)) {
    const order = body.order.map((value: unknown) => String(value || "")).filter(Boolean);
    for (let index = 0; index < order.length; index += 1) {
      const { error } = await auth.supabase
        .from("crm_booking_items")
        .update({ sort_order: index })
        .eq("id", order[index])
        .eq("booking_id", bookingId);
      if (error) return dbError(error, 400);
    }
    return NextResponse.json({ ok: true });
  }
  const itemId = String(body?.id || "");
  if (!itemId) return jsonError("id requis");
  const { data: current, error: currentError } = await auth.supabase
    .from("crm_booking_items")
    .select("kind, amount")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (currentError) return dbError(currentError, 400);
  if (!current) return jsonError("Carte introuvable", 404);
  const nextKind = body.kind != null ? knownKind(body.kind) : knownKind(current.kind);
  if (!nextKind) return jsonError("Type de carte inconnu");
  const patch: Record<string, unknown> = {};
  if (body.kind != null) patch.kind = nextKind;
  if (body.title != null) patch.title = body.title;
  if ("supplier" in body) patch.supplier = body.supplier;
  if ("confirmation_ref" in body) patch.confirmation_ref = body.confirmation_ref;
  if ("start_at" in body) patch.start_at = body.start_at;
  if ("end_at" in body) patch.end_at = body.end_at;
  if ("amount" in body) patch.amount = parseMoney(body.amount);
  if ("include_in_ledger" in body) {
    patch.include_in_ledger = parseIncludeInLedger(body.include_in_ledger, false);
  }
  if (isLedgerExpenseKind(nextKind)) {
    const amount = "amount" in body ? parseMoney(body.amount) : parseMoney(current.amount);
    if (amount == null || amount <= 0) return jsonError("Montant requis");
    patch.include_in_ledger = true;
    if ("amount" in body) patch.amount = amount;
  }
  if (body.sort_order != null) patch.sort_order = Number(body.sort_order);
  if ("details" in body) patch.details = body.details || {};
  if ("billing_company_id" in body) {
    const company = await billingCompanyPatch(auth.supabase, bookingId, body.billing_company_id);
    if ("error" in company && company.error) return jsonError(company.error);
    if ("billing_company_id" in company) patch.billing_company_id = company.billing_company_id;
  }
  if (!Object.keys(patch).length) return jsonError("Rien à mettre à jour");
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .update(patch)
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  await refreshBookingLedger(auth.supabase, bookingId);
  return NextResponse.json({ item: data });
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
  await refreshBookingLedger(auth.supabase, bookingId);
  return NextResponse.json({ ok: true });
}
