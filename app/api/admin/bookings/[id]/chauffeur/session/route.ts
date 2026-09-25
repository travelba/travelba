import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { openRolzoSession, RolzoError, rolzoWebHost } from "@/lib/crm/rolzo";
import type { CrmCustomer } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const { data: holder } = await auth.supabase
    .from("crm_customers")
    .select("first_name, last_name, email, phone")
    .eq("id", booking.customer_id)
    .maybeSingle();
  if (!holder) return jsonError("Client introuvable", 404);
  try {
    const encodedData = await openRolzoSession(holder as Pick<CrmCustomer, "first_name" | "last_name" | "email" | "phone">);
    return NextResponse.json({ encodedData, webHost: rolzoWebHost() });
  } catch (err) {
    if (err instanceof RolzoError) return jsonError(err.message, err.status);
    return jsonError("La session chauffeur n’a pas pu s’ouvrir.", 502);
  }
}
