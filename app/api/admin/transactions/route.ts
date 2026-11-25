import { NextResponse } from "next/server";
import { createTransactionSchema, parseBody } from "@/lib/crm/admin-schemas";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { resolveWireAccount } from "@/lib/crm/funding-wallet";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("*")
    .eq("kind", "transfer")
    .eq("direction", "credit")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) return dbError(error, 500);
  return NextResponse.json({ transactions: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "edit_finances");
  if (denied) return denied;
  const parsed = parseBody(createTransactionSchema, await request.json().catch(() => null));
  if (parsed.error !== null) return jsonError(parsed.error, 400);
  const body = parsed.data;
  const wantsOtherKind = Boolean(body.kind) && body.kind !== "transfer";
  const wantsDebit = body.direction === "debit";
  if (wantsOtherKind || wantsDebit) {
    return jsonError("L’espace agence n’enregistre que les virements crédit.");
  }
  const { data: customer } = await auth.supabase
    .from("crm_customers")
    .select("id")
    .eq("id", body.customer_id)
    .maybeSingle();
  if (!customer) return jsonError("Client introuvable", 404);
  if (!body.booking_id || !body.payer_kind) return jsonError("Choisissez le dossier et le payeur.");
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("id, customer_id, billing_customer_id")
    .eq("id", body.booking_id)
    .maybeSingle();
  if (!booking) return jsonError("Dossier introuvable", 404);
  if (booking.customer_id !== body.customer_id && booking.billing_customer_id !== body.customer_id) {
    return jsonError("Ce dossier n’est pas celui de ce client.");
  }
  const { data: companies } = await auth.supabase
    .from("crm_billing_companies")
    .select("id, funding, customer_id")
    .eq("customer_id", body.customer_id);
  const account = resolveWireAccount(companies || [], body.billing_company_id);
  if ("error" in account) return jsonError(account.error);
  const companyId =
    account.billingCompanyId || (body.payer_kind === "company" ? body.billing_company_id || null : null);
  if (body.payer_kind === "company" && !companyId) return jsonError("Choisissez la société.");
  if (body.payer_kind === "company" && companyId && !(companies || []).some((company) => company.id === companyId)) {
    return jsonError("Cette société n’est pas sur la fiche.");
  }
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .insert({
      customer_id: body.customer_id,
      booking_id: body.booking_id,
      direction: "credit",
      kind: "transfer",
      amount: body.amount,
      currency: body.currency,
      occurred_on: body.occurred_on || undefined,
      label: body.label || "Virement manuel",
      source: "manual",
      status: "posted",
      payer_kind: body.payer_kind,
      billing_company_id: body.payer_kind === "personal" && !account.billingCompanyId ? null : companyId,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ transaction: data });
}
