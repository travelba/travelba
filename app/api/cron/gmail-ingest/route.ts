import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import {
  catchUpGmailHistory,
  emailParsingReady,
  processReceivedEmailIngest,
  rematchStoredEmailIngest,
} from "@/lib/crm/email-ingest";
import { gmailConfigured } from "@/lib/crm/gmail";

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
  if (!gmailConfigured()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  if (!emailParsingReady()) {
    return NextResponse.json({ skipped: true, reason: "ai_not_configured" });
  }
  try {
    // Rattrapage (au cas où une notification push aurait été manquée), puis traitement.
    let captured = 0;
    try {
      const catchUp = await catchUpGmailHistory();
      captured = catchUp.captured;
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] catchup",
        err instanceof Error ? err.message : err
      );
    }
    const result = await processReceivedEmailIngest(10);
    let rematch = { scanned: 0, rematched: 0, failed: 0 };
    try {
      rematch = await rematchStoredEmailIngest(20);
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] rematch",
        err instanceof Error ? err.message : err
      );
    }
    return NextResponse.json({ captured, ...result, rematch });
  } catch (err) {
    console.error("[cron/gmail-ingest]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Ingestion e-mail échouée" }, { status: 502 });
  }
}
