import { NextResponse } from "next/server";
import { recordPliantAlert } from "@/lib/crm/agency-log";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { pliantConfigured, readPliantHealth } from "@/lib/crm/pliant";
import { syncPliantAccount } from "@/lib/crm/pliant-sync";

/** Toutes les 30 minutes, minute 12. Dépenses carte, pas un encaissement. Fenêtre de 10 jours après le premier passage. */
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
    const health = await readPliantHealth();
    if (!health.ok) {
      console.error("[cron/pliant-sync] santé", health.reason);
      await recordPliantAlert(health.reason);
    }
    const result = await syncPliantAccount();
    return NextResponse.json({ ...result, health: health.ok ? "ok" : "illisible" });
  } catch (err) {
    console.error("[cron/pliant-sync]", err instanceof Error ? err.message : "échec");
    return NextResponse.json({ error: "Synchronisation Pliant échouée" }, { status: 502 });
  }
}
