import { NextResponse } from "next/server";
import { littleEmperorsWebhookAuthorized, parseLeWebhook } from "@/lib/crm/little-emperors";
import { upsertLittleEmperorsWebhook } from "@/lib/crm/little-emperors-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

const EVENTS = new Set(["hotel_booking_create", "hotel_booking_update", "hotel_booking_cancel"]);

export async function POST(request: Request) {
  if (!littleEmperorsWebhookAuthorized(request.headers)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }
  const parsed = parseLeWebhook(body);
  if (!parsed || !parsed.booking || !EVENTS.has(parsed.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    const result = await upsertLittleEmperorsWebhook(parsed.event, parsed.booking);
    return NextResponse.json({ status: "success", ...result });
  } catch (err) {
    console.error("[webhooks/little-emperors]", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
}
