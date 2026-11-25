import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runDueHotelCharge } from "@/lib/crm/hotel-charge-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Un lien hôtel, Chromium empaqueté. Sans HOTEL_CHARGE_WORKER, rien n’est ouvert. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const result = await runDueHotelCharge(createServiceClient());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ skipped: true, reason: "erreur" });
  }
}
