import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { loadEspaceBookings } from "@/lib/crm/espace-load";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const list = await loadEspaceBookings(auth.supabase, auth.customer);
    return NextResponse.json(list, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[client/espace/bookings]", err instanceof Error ? err.message : "load");
    return jsonError("Réservations indisponibles", 500);
  }
}
