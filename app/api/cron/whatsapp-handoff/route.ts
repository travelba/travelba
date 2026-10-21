import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runTakeoverHandoff } from "@/lib/crm/whatsapp-handoff";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Chaque minute : un fil tenu par l’agence sans activité depuis 5 minutes revient au Concierge. */
export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const result = await runTakeoverHandoff(createServiceClient());
    return NextResponse.json(result);
  } catch {
    console.error("[whatsapp-handoff] cron");
    return NextResponse.json({ error: "Indisponible" }, { status: 503 });
  }
}
