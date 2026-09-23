import { NextResponse } from "next/server";
import { decodeGmailPushBody } from "@/lib/crm/gmail-parse";
import { gmailConfigured } from "@/lib/crm/gmail";
import { captureGmailHistory } from "@/lib/crm/email-ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

function tokenAuthorized(request: Request) {
  const expected = (process.env.GMAIL_PUSH_TOKEN || "").trim();
  if (!expected) return false;
  const token = new URL(request.url).searchParams.get("token") || "";
  return token === expected;
}

export async function POST(request: Request) {
  if (!tokenAuthorized(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!gmailConfigured()) {
    // Ack pour éviter les retries Pub/Sub tant que Gmail n'est pas configuré.
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const decoded = decodeGmailPushBody(body);
  if (!decoded) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const { captured } = await captureGmailHistory(decoded.historyId);
    return NextResponse.json({ ok: true, captured });
  } catch (err) {
    console.error("[webhooks/gmail]", err instanceof Error ? err.message : err);
    // 500 → Pub/Sub réessaiera la notification.
    return NextResponse.json({ error: "capture_failed" }, { status: 500 });
  }
}
