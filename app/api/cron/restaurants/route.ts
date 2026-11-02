import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runRestaurantCronJob } from "@/lib/crm/restaurants-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Toutes les 15 minutes. L’envoi de 16 h et la clôture de 18 h suivent l’heure locale du séjour. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const admin = createServiceClient();
  const result = await runRestaurantCronJob(admin);
  return NextResponse.json(result);
}
