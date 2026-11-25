import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runTravelNotices } from "@/lib/crm/travel-notices-run";
import { createServiceClient } from "@/lib/supabase/admin";

/** Toutes les heures, minute 8. Les heures calmes sont décidées dans le plan, fuseau Europe/Paris. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await runTravelNotices(createServiceClient());
  return NextResponse.json(result);
}
