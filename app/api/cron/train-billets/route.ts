import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runMorningTrainTickets } from "@/lib/crm/train-billets-run";
import { createServiceClient } from "@/lib/supabase/admin";

/** Le matin du départ, ou deux heures avant si le train part tôt. Sans SID, aucun appel Twilio. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await runMorningTrainTickets(createServiceClient());
  return NextResponse.json(result);
}
