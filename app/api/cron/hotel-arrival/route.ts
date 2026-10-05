import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { purgeClientStayCards } from "@/lib/crm/card-link-run";
import { runHotelArrivals } from "@/lib/crm/hotel-arrival-run";
import { refreshHotelDesk } from "@/lib/crm/hotel-desk-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createServiceClient();
  const result = await runHotelArrivals(admin);
  const desk = await refreshHotelDesk(admin);
  // Photos de cartes clients : effacées après la fermeture de la carte du séjour (B-04).
  const purgedClientCards = await purgeClientStayCards(admin).catch(() => 0);
  return NextResponse.json({ ...result, desk, purgedClientCards });
}
