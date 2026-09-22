import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import {
  billingCompanyInsertFromTraveler,
  bookingsToRebill,
  travelerAttachPatch,
} from "@/lib/crm/billing-company";
import { canOpenBillingCompany } from "@/lib/crm/company-role";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { appOrigin, inviteCustomer } from "@/lib/crm/invite";
import { toE164 } from "@/lib/crm/phone";
import type { CompanyRole, CrmBooking, CrmCustomer } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id: travelerId } = await ctx.params;
  const body = await request.json().catch(() => null);

  const { data: traveler, error: travelerError } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .eq("id", travelerId)
    .maybeSingle();
  if (travelerError) return dbError(travelerError, 500);
  if (!traveler) return jsonError("Client introuvable", 404);
  const current = traveler as CrmCustomer;
  if (!canOpenBillingCompany(current)) {
    return jsonError(
      "Cette fiche a déjà un wallet société, ou aucun nom de société. Enregistrez le nom puis réessayez."
    );
  }

  const phoneRaw = String(body?.phone || "").trim();
  const created = billingCompanyInsertFromTraveler(current, {
    first_name: String(body?.first_name || ""),
    last_name: String(body?.last_name || ""),
    email: String(body?.email || ""),
    phone: phoneRaw ? toE164(phoneRaw, "FR") || phoneRaw : null,
    company_name: body?.company_name != null ? String(body.company_name) : current.company_name,
  });
  if ("error" in created) return jsonError(created.error, 400);

  const { data: existing } = await auth.supabase
    .from("crm_customers")
    .select("id")
    .eq("email", created.row.email)
    .maybeSingle();
  if (existing) return jsonError("Un client existe déjà avec cet e-mail.");

  const { data: company, error: insertError } = await auth.supabase
    .from("crm_customers")
    .insert(created.row)
    .select("*")
    .single();
  if (insertError) return dbError(insertError, 400);
  const companyCustomer = company as CrmCustomer;

  const attach = travelerAttachPatch(companyCustomer.id, current.company_role as CompanyRole | null);
  const { data: attached, error: attachError } = await auth.supabase
    .from("crm_customers")
    .update(attach)
    .eq("id", travelerId)
    .select("*")
    .single();
  if (attachError) return dbError(attachError, 400);

  let rebilled = 0;
  if (body?.rebill_open_bookings !== false) {
    const { data: bookings } = await auth.supabase
      .from("crm_bookings")
      .select("*")
      .eq("customer_id", travelerId);
    const toMove = bookingsToRebill((bookings || []) as CrmBooking[], travelerId);
    for (const booking of toMove) {
      const { data: updated, error: bookingError } = await auth.supabase
        .from("crm_bookings")
        .update({ billing_customer_id: companyCustomer.id })
        .eq("id", booking.id)
        .select("*")
        .single();
      if (bookingError || !updated) continue;
      await refreshBookingLedger(auth.supabase, (updated as CrmBooking).id);
      rebilled += 1;
    }
  }

  if (!body?.invite) {
    return NextResponse.json({
      company: companyCustomer,
      traveler: attached,
      rebilled,
      invited: false,
    });
  }

  try {
    const result = await inviteCustomer(companyCustomer, appOrigin(request));
    return NextResponse.json({
      company: result.customer,
      traveler: attached,
      rebilled,
      invited: result.delivered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invitation impossible";
    return NextResponse.json({
      company: companyCustomer,
      traveler: attached,
      rebilled,
      invited: false,
      inviteError: message,
    });
  }
}
