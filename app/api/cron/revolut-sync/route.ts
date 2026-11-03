import { NextResponse } from "next/server";
import { revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import { syncRevolutWindow } from "@/lib/crm/revolut-delta";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";

/** Quart d’heure, minute 2. Webhook d’abord, ce cron rattrape depuis le dernier curseur. */
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = cronSecret();
  return cronAuthorized(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!revolutConfigured()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  if (!(await revolutConnected())) {
    return NextResponse.json({ skipped: true, reason: "not_connected" });
  }
  try {
    const synced = await syncRevolutWindow();
    const auto = await autoMatchUnmatchedRevolut();
    return NextResponse.json({
      fetched: synced.fetched,
      inserted: synced.inserted,
      written: synced.written,
      from: synced.from,
      auto_matched: auto.matched,
    });
  } catch (err) {
    console.error("[cron/revolut-sync]", err);
    return NextResponse.json({ error: "Synchronisation Revolut échouée" }, { status: 502 });
  }
}
