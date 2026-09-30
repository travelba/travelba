import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { pliantConfigured } from "@/lib/crm/pliant";
import { syncPliantAccount } from "@/lib/crm/pliant-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!pliantConfigured()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  try {
    const result = await syncPliantAccount();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/pliant-sync]", err instanceof Error ? err.message : "échec");
    return NextResponse.json({ error: "Synchronisation Pliant échouée" }, { status: 502 });
  }
}
