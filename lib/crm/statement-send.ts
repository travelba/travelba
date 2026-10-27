import { NextResponse } from "next/server";
import { jsonError } from "./auth";
import { uploadCrmFile } from "./files";
import { isVercelPreview } from "./preview-secrets";
import { STATEMENT_FILENAME, statementObjectPath, type StatementAudience } from "./statement";
import { statementSignedPath } from "./statement-link";
import { runStatementDelivery, STATEMENT_TEMPLATE_ENV } from "./statement-whatsapp";
import { resolveContentSid } from "./twilio-content-sid";
import { createServiceClient } from "@/lib/supabase/admin";
import { toE164 } from "./phone";
import { sendContentTemplate, whatsappAddress } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";

export { STATEMENT_FILENAME };

export function statementPdfResponse(pdf: Uint8Array) {
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${STATEMENT_FILENAME}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function statementSendResponse(
  result: { ok: true; message: string } | { ok: false; status: number; message: string }
) {
  if (!result.ok) return jsonError(result.message, result.status);
  return NextResponse.json({ ok: true, message: result.message });
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function windowOpen(customerId: string, phone: string | null) {
  try {
    const admin = createServiceClient();
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const byCustomer = await admin
      .from("crm_whatsapp_messages")
      .select("id")
      .eq("customer_id", customerId)
      .eq("direction", "inbound")
      .gte("created_at", since)
      .limit(1);
    if (!byCustomer.error && (byCustomer.data || []).length > 0) return true;
    if (!phone) return false;
    const byPhone = await admin
      .from("crm_whatsapp_messages")
      .select("id")
      .eq("phone", phone)
      .eq("direction", "inbound")
      .gte("created_at", since)
      .limit(1);
    if (byPhone.error) return false;
    return (byPhone.data || []).length > 0;
  } catch {
    return false;
  }
}

function journalClient() {
  return createServiceClient();
}

/**
 * Dépose le PDF (URL courte pour Twilio, jamais renvoyée au navigateur)
 * et l’envoie sur le WhatsApp du client. Chaque essai est écrit dans
 * crm_whatsapp_messages, y compris un refus.
 */
export async function deliverStatementWhatsapp(input: {
  customerId: string;
  phone: string | null | undefined;
  firstName: string | null | undefined;
  member: boolean;
  pdf: Uint8Array;
  audience: StatementAudience;
  optOutAt?: string | null;
  staffId?: string | null;
}) {
  const phone = toE164(input.phone || "", "FR");
  const to = whatsappAddress(input.phone);
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  let templateSid: string | null = null;
  let prior: { id: string; status: string } | null = null;
  let open = false;
  try {
    templateSid = (await resolveContentSid(STATEMENT_TEMPLATE_ENV)) || null;
  } catch {
    templateSid = null;
  }
  try {
    open = await windowOpen(input.customerId, phone);
  } catch {
    open = false;
  }
  try {
    const admin = journalClient();
    const existing = await admin
      .from("crm_whatsapp_messages")
      .select("id, status")
      .eq("dedupe_key", `releve:${input.customerId}:${day}`)
      .maybeSingle();
    if (!existing.error && existing.data) prior = existing.data as { id: string; status: string };
  } catch {
    prior = null;
  }

  const result = await runStatementDelivery(
    {
      customerId: input.customerId,
      phone,
      to,
      firstName: input.firstName,
      member: input.member,
      audience: input.audience,
      pdf: input.pdf,
      windowOpen: open,
      templateSid,
      optedOut: Boolean(input.optOutAt),
      previewBlocked: isVercelPreview(),
      now,
      prior,
      staffId: input.staffId || null,
    },
    {
      upload: async (path, pdf) => {
        await uploadCrmFile(path, Buffer.from(pdf), "application/pdf", { upsert: true });
      },
      objectPath: statementObjectPath,
      mediaPath: (customerId, at) => statementSignedPath(customerId, at.getTime()),
      sendSession: async (message) => {
        const sent = await sendWhatsappSession({ to: message.to, body: message.body, mediaUrl: message.mediaUrl });
        if (!sent.ok) return { ok: false, detail: sent.detail };
        return { ok: true, sid: sent.sid };
      },
      sendTemplate: async (message) => {
        const sent = await sendContentTemplate({
          phone: message.phone,
          contentSid: message.contentSid,
          variables: message.variables,
        });
        if (!sent.ok) return { ok: false, detail: sent.detail || sent.reason };
        return { ok: true, sid: sent.sid };
      },
      insert: async (row) => {
        try {
          const admin = journalClient();
          const inserted = await admin.from("crm_whatsapp_messages").insert(row).select("id").maybeSingle();
          if (inserted.error?.code === "23505") return { error: "duplicate" as const };
          if (inserted.error || !inserted.data) {
            console.error("[releve] journal", inserted.error?.code || "insert");
            return { error: "failed" as const };
          }
          return { id: String((inserted.data as { id: string }).id) };
        } catch {
          return { error: "failed" as const };
        }
      },
      update: async (id, patch) => {
        try {
          const admin = journalClient();
          const updated = await admin.from("crm_whatsapp_messages").update(patch).eq("id", id);
          if (updated.error) {
            console.error("[releve] journal", updated.error.code || "update");
            return false;
          }
          return true;
        } catch {
          return false;
        }
      },
      find: async (dedupeKey) => {
        try {
          const admin = journalClient();
          const found = await admin
            .from("crm_whatsapp_messages")
            .select("id, status")
            .eq("dedupe_key", dedupeKey)
            .maybeSingle();
          if (found.error || !found.data) return null;
          return found.data as { id: string; status: string };
        } catch {
          return null;
        }
      },
    }
  );
  if (!result.ok) console.error("[releve]", result.code);
  return result;
}

export type { StatementAudience };
