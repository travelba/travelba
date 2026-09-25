import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { writeBillingAssignment } from "@/lib/crm/billing-companies";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return jsonError("Enregistrement indisponible.", 503);
  }
  const { data, error } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .eq("visible_to_client", true)
    .maybeSingle();
  if (error) return dbError(error, 400);
  if (!data) return jsonError("Séjour introuvable", 404);
  const written = await writeBillingAssignment(admin, data as CrmBooking, body);
  if ("error" in written) return jsonError(written.error, written.status || 400);
  await refreshBookingLedger(admin, id);
  return NextResponse.json({ ok: true });
}
