import { NextResponse } from "next/server";
import { verifyRevolutWebhook, upsertRevolutInbox, type RevolutTx } from "@/lib/crm/revolut";
import { changedRevolutTransactions } from "@/lib/crm/revolut-delta";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";
import { isRevolutTimestampFresh } from "@/lib/crm/revolut-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  const timestamp = request.headers.get("Revolut-Request-Timestamp") || "";
  const signature = request.headers.get("Revolut-Signature") || "";
  // Rejeu : un timestamp absent, illisible ou vieux de plus de 5 minutes est refusé avant la signature.
  if (!isRevolutTimestampFresh(timestamp)) {
    return NextResponse.json({ error: "timestamp" }, { status: 401 });
  }
  try {
    if (!verifyRevolutWebhook(raw, timestamp, signature)) {
      return NextResponse.json({ error: "signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "config" }, { status: 503 });
  }
  const payload = JSON.parse(raw) as {
    event?: string;
    data?: RevolutTx;
  };
  if (payload.event === "TransactionCreated" && payload.data?.id) {
    let fresh = [payload.data];
    try {
      fresh = await changedRevolutTransactions([payload.data]);
    } catch {
      fresh = [payload.data];
    }
    if (!fresh.length) return NextResponse.json({ ok: true, auto_matched: 0 });
    await upsertRevolutInbox(fresh);
    const auto = await autoMatchUnmatchedRevolut(50);
    return NextResponse.json({ ok: true, auto_matched: auto.matched });
  }
  return NextResponse.json({ ok: true });
}
