import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import {
  backfillBilletAvionMessages,
  backfillBookingCancellationMessages,
  backfillCrmMessages,
  backfillQueuedEmailBodies,
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
    let backfill = { captured: 0, scanned: 0 };
    try {
      backfill = await backfillBilletAvionMessages();
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] billet-avion",
        err instanceof Error ? err.message : err
      );
    }
    let cancellationBackfill = { captured: 0, scanned: 0 };
    try {
      cancellationBackfill = await backfillBookingCancellationMessages();
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] booking-cancellation",
        err instanceof Error ? err.message : err
      );
    }
    let crmBackfill = { captured: 0, scanned: 0 };
    try {
      crmBackfill = await backfillCrmMessages();
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] crm",
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
    // Corps des mails de la file encore vides : relus ici, plus sur le GET de /admin/emails (A-26).
    let bodies = { scanned: 0, filled: 0 };
    try {
      bodies = await backfillQueuedEmailBodies(20);
    } catch (err) {
      console.error(
        "[cron/gmail-ingest] bodies",
        err instanceof Error ? err.message : err
      );
    }
    return NextResponse.json({
      captured,
      backfill,
      cancellationBackfill,
      crmBackfill,
      ...result,
      rematch,
      bodies,
    });
  } catch (err) {
    console.error("[cron/gmail-ingest]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Ingestion e-mail échouée" }, { status: 502 });
  }
}
