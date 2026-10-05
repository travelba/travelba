import { NextResponse } from "next/server";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { collectManualCreateIssues } from "@/lib/crm/booking-issues";
import { nextBookingReference, parseIncludeInLedger, syncBookingLedger } from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { assignPayer, defaultPayer, resolveFeesFollowStay, type PayerCompany } from "@/lib/crm/payer";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) return dbError(error, 500);
  return NextResponse.json({ bookings: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const title = String(body?.title || "").trim();
  const createIssues = collectManualCreateIssues({ customerId, title });
  if (createIssues.length) return jsonIssues(createIssues);
  const { data: traveler, error: travelerError } = await auth.supabase
    .from("crm_customers")
    .select("id, company_role, billing_parent_id")
    .eq("id", customerId)
    .maybeSingle();
  if (travelerError) return dbError(travelerError, 500);
  if (!traveler) {
    return jsonIssues([{ field: "customer_id", message: "Client introuvable." }], 404);
  }
  const billingCustomerId = body?.billing_customer_id
    ? String(body.billing_customer_id)
    : resolveBillingCustomerId(traveler as CrmCustomer);
  const { data: companyRows, error: companyError } = await auth.supabase
    .from("crm_billing_companies")
    .select("id, sort_order")
    .eq("customer_id", billingCustomerId)
    .order("sort_order");
  if (companyError) return dbError(companyError, 500);
  const companies = (companyRows || []) as PayerCompany[];
  const payer =
    body?.payer_kind != null && body.payer_kind !== ""
      ? assignPayer({ payerKind: body.payer_kind, companyId: body.billing_company_id, companies })
      : defaultPayer(companies);
  if ("error" in payer) return jsonError(payer.error);
  let reference: string;
  try {
    // La RPC n’est plus exécutable par le rôle authenticated (B-14).
    reference = await nextBookingReference(createServiceClient());
  } catch (err) {
    console.error("[bookings] reference:", err);
    return jsonError("Impossible de générer la référence du dossier. Réessayez.", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .insert({
      customer_id: customerId,
      billing_customer_id: billingCustomerId,
      billing_company_id: payer.billing_company_id,
      payer_kind: payer.payer_kind,
      fees_follow_stay: resolveFeesFollowStay({
        stayKind: payer.payer_kind,
        requested: parseIncludeInLedger(body?.fees_follow_stay, true),
        companyCount: companies.length,
      }),
      reference,
      title,
      destination: body?.destination || null,
      status: body?.status || "draft",
      start_date: body?.start_date || null,
      end_date: body?.end_date || null,
      currency: body?.currency || "EUR",
      total_amount: 0,
      include_in_ledger: parseIncludeInLedger(body?.include_in_ledger, true),
      agency_commission: parseIncludeInLedger(body?.agency_commission, false),
      client_settles_stay: parseIncludeInLedger(body?.client_settles_stay, false),
      notes_client: body?.notes_client || null,
      notes_internal: body?.notes_internal || null,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const booking = data as CrmBooking;
  await syncBookingLedger(auth.supabase, booking);
  return NextResponse.json({ booking });
}
