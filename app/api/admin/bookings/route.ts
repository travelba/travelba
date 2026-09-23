import { NextResponse } from "next/server";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { collectManualCreateIssues } from "@/lib/crm/booking-issues";
import { nextBookingReference, parseIncludeInLedger, syncBookingLedger } from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { scheduleBookingCover } from "@/lib/crm/cover-generate";
import type { CrmBooking, CrmCustomer } from "@/lib/crm/types";

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
  let reference: string;
  try {
    reference = await nextBookingReference(auth.supabase);
  } catch (err) {
    console.error("[bookings] reference:", err);
    return jsonError("Impossible de générer la référence du dossier. Réessayez.", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .insert({
      customer_id: customerId,
      billing_customer_id: billingCustomerId,
      reference,
      title,
      destination: body?.destination || null,
      status: body?.status || "draft",
      start_date: body?.start_date || null,
      end_date: body?.end_date || null,
      currency: body?.currency || "EUR",
      total_amount: Number(body?.total_amount || 0),
      include_in_ledger: parseIncludeInLedger(body?.include_in_ledger, true),
      notes_client: body?.notes_client || null,
      notes_internal: body?.notes_internal || null,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const booking = data as CrmBooking;
  await syncBookingLedger(auth.supabase, booking);
  scheduleBookingCover(booking);
  return NextResponse.json({ booking });
}
