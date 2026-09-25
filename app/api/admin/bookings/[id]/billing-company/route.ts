import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { writeBillingAssignment } from "@/lib/crm/billing-companies";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import type { CrmBooking } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 400);
  if (!data) return jsonError("Séjour introuvable", 404);
  const written = await writeBillingAssignment(auth.supabase, data as CrmBooking, body);
  if ("error" in written) return jsonError(written.error, written.status || 400);
  await refreshBookingLedger(auth.supabase, id);
  return NextResponse.json({ ok: true });
}
