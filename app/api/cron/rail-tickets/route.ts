import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runRailTickets } from "@/lib/crm/rail-ticket-run";
import { createServiceClient } from "@/lib/supabase/admin";

/** Toutes les 10 minutes. La fenêtre d’envoi couvre plus qu’un intervalle, jusqu’au départ. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const essai = new URL(request.url).searchParams.get("essai") === "1";
  const result = await runRailTickets(createServiceClient(), { dryRun: essai });
  return NextResponse.json(result);
}
