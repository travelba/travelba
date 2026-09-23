import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import {
  gmailConfigured,
  gmailLabelNames,
  gmailPubsubTopic,
  resolveLabelIds,
} from "@/lib/crm/gmail";
import { EMAIL_SYNC_PROVIDER } from "@/lib/crm/email-ingest";
import type { EmailIngestStatus } from "@/lib/crm/types";

export const runtime = "nodejs";

/** Diagnostic staff : valide l'accès Gmail (auth SA + labels) sans effet de bord. */
export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const requested = gmailLabelNames();
  const topicSet = Boolean(gmailPubsubTopic());
  const configured = gmailConfigured();

  let gmail:
    | { ok: true; labelsFound: string[]; labelsMissing: string[] }
    | { ok: false; error: string }
    | null = null;

  if (configured) {
    try {
      const map = await resolveLabelIds(requested);
      const found = [...map.keys()];
      gmail = {
        ok: true,
        labelsFound: found,
        labelsMissing: requested.filter((n) => !found.includes(n)),
      };
    } catch (err) {
      gmail = {
        ok: false,
        error: err instanceof Error ? err.message : "Connexion Gmail impossible",
      };
    }
  }

  const { data: sync } = await auth.supabase
    .from("crm_email_sync")
    .select("history_id, watch_expiration, updated_at")
    .eq("provider", EMAIL_SYNC_PROVIDER)
    .maybeSingle();

  const statuses: EmailIngestStatus[] = [
    "received",
    "parsed",
    "matched",
    "attached",
    "refused",
    "error",
  ];
  const counts: Record<string, number> = {};
  await Promise.all(
    statuses.map(async (status) => {
      const { count } = await auth.supabase
        .from("crm_email_ingest")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = count ?? 0;
    })
  );

  return NextResponse.json({
    configured,
    topicSet,
    requestedLabels: requested,
    gmail,
    sync: sync || null,
    counts,
  });
}
