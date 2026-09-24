import { NextResponse } from "next/server";
import {
  fetchRevolutTransactions,
  revolutConfigured,
  revolutConnected,
  upsertRevolutInbox,
} from "@/lib/crm/revolut";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";

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
    const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const txs = await fetchRevolutTransactions(from);
    const inserted = await upsertRevolutInbox(txs);
    const auto = await autoMatchUnmatchedRevolut();
    return NextResponse.json({
      fetched: txs.length,
      inserted,
      auto_matched: auto.matched,
    });
  } catch (err) {
    console.error("[cron/revolut-sync]", err);
    return NextResponse.json({ error: "Synchronisation Revolut échouée" }, { status: 502 });
  }
}
