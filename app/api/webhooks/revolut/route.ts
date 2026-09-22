import { NextResponse } from "next/server";
import {
  upsertRevolutInbox,
  verifyRevolutWebhook,
  type RevolutTx,
} from "@/lib/crm/revolut";
import { autoMatchUnmatchedRevolut } from "@/lib/crm/revolut-match";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  const timestamp = request.headers.get("Revolut-Request-Timestamp") || "";
  const signature = request.headers.get("Revolut-Signature") || "";
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
    await upsertRevolutInbox([payload.data]);
    const auto = await autoMatchUnmatchedRevolut(50);
    return NextResponse.json({ ok: true, auto_matched: auto.matched });
  }
  return NextResponse.json({ ok: true });
}
