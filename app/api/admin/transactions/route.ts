import { NextResponse } from "next/server";
import { createTransactionSchema, parseBody } from "@/lib/crm/admin-schemas";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { formatJournalAmount } from "@/lib/crm/agency-journal-kinds";
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
  if (body.booking_id) {
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("id")
      .eq("id", body.booking_id)
      .maybeSingle();
    if (!booking) return jsonError("Dossier introuvable", 404);
  }
  const { data: companies } = await auth.supabase
    .from("crm_billing_companies")
    .select("id, funding")
    .eq("customer_id", body.customer_id);
  const account = resolveWireAccount(companies || [], body.billing_company_id);
  if ("error" in account) return jsonError(account.error);
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .insert({
      customer_id: body.customer_id,
      booking_id: body.booking_id || null,
      direction: "credit",
      kind: "transfer",
      amount: body.amount,
      currency: body.currency,
      occurred_on: body.occurred_on || undefined,
      label: body.label || "Virement manuel",
      source: "manual",
      status: "posted",
      ...(account.billingCompanyId
        ? { billing_company_id: account.billingCompanyId, payer_kind: "company" as const }
        : {}),
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const amountCents = eurosToAlertCents(Number(body.amount));
  const amountWords = formatJournalAmount(amountCents, body.currency);
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "create",
    entityType: "finance",
    entityId: (data as { id?: string } | null)?.id ?? null,
    summary: `Virement reçu enregistré au grand livre${amountWords ? `, ${amountWords}` : ""}${body.label ? ` (${String(body.label).slice(0, 80)})` : ""}.`,
    kind: "paiement_recu",
    bookingId: body.booking_id || null,
    amountCents,
    currency: body.currency,
    sensitive: "payment",
    path: "/api/admin/transactions",
  });
  return NextResponse.json({ transaction: data });
}
