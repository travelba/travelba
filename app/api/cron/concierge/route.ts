import { NextResponse } from "next/server";
import { flushConcierge } from "@/lib/crm/concierge-send";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendCatalogSamples } from "@/lib/crm/whatsapp-samples";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await flushConcierge();
  const samples = await sendCatalogSamples(createServiceClient()).catch(() => ({ skipped: "error" as const }));
  return NextResponse.json({ ...result, samples });
}
