import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/crm/cron-auth";
import {
  gmailConfigured,
  gmailLabelNames,
  gmailPubsubTopic,
  resolveLabelIds,
  watchMailbox,
} from "@/lib/crm/gmail";
import { setEmailWatch } from "@/lib/crm/email-ingest";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return cronAuthorized(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!gmailConfigured()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  const topic = gmailPubsubTopic();
  if (!topic) {
    return NextResponse.json({ skipped: true, reason: "no_topic" });
  }
  try {
    const labelIds = await resolveLabelIds(gmailLabelNames());
    if (!labelIds.size) {
      return NextResponse.json({ skipped: true, reason: "labels_not_found" });
    }
    const watch = await watchMailbox(topic, [...labelIds.values()]);
    await setEmailWatch(createServiceClient(), watch.historyId, watch.expiration);
    return NextResponse.json({
      ok: true,
      labels: [...labelIds.keys()],
      expiration: watch.expiration,
    });
  } catch (err) {
    console.error("[cron/gmail-watch-renew]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Renouvellement watch échoué" }, { status: 502 });
  }
}
