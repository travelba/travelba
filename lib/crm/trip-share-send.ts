import { isVercelPreview } from "./preview-secrets";
import { toE164 } from "./phone";
import { resolveContentSid } from "./twilio-content-sid";
import { sendContentTemplate, whatsappAddress } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";
import {
  runTripShareDelivery,
  TRIP_SHARE_TEMPLATE_ENV,
  tripShareDedupeKey,
  tripShareParisDay,
  type TripShareAudience,
} from "./trip-share-whatsapp";
import { createServiceClient } from "@/lib/supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La fenêtre de 24 h est celle du téléphone qui reçoit.
 * Un message du titulaire n’ouvre pas la conversation de l’accompagnateur.
 */
async function windowOpen(phone: string | null) {
  if (!phone) return false;
  try {
    const admin = createServiceClient();
    const since = new Date(Date.now() - DAY_MS).toISOString();
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

/**
 * Envoie le lien public du voyage et écrit chaque essai dans
 * crm_whatsapp_messages, y compris un refus.
 */
export async function deliverTripShareWhatsapp(input: {
  customerId: string;
  bookingId: string;
  companionId: string;
  phone: string | null | undefined;
  firstName: string;
  title: string;
  url: string;
  mediaUrl?: string | null;
  audience: TripShareAudience;
  staffId?: string | null;
}) {
  const phone = toE164(input.phone || "", "FR");
  const to = whatsappAddress(input.phone);
  const now = new Date();
  const day = tripShareParisDay(now);
  let templateSid: string | null = null;
  let prior: { id: string; status: string } | null = null;
  let open = false;
  try {
    templateSid = (await resolveContentSid(TRIP_SHARE_TEMPLATE_ENV)) || null;
  } catch {
    templateSid = null;
  }
  try {
    open = await windowOpen(phone);
  } catch {
    open = false;
  }
  try {
    const admin = createServiceClient();
    const existing = await admin
      .from("crm_whatsapp_messages")
      .select("id, status")
      .eq("dedupe_key", tripShareDedupeKey(input.bookingId, input.companionId, day))
      .maybeSingle();
    if (!existing.error && existing.data) prior = existing.data as { id: string; status: string };
  } catch {
    prior = null;
  }

  const result = await runTripShareDelivery(
    {
      customerId: input.customerId,
      bookingId: input.bookingId,
      companionId: input.companionId,
      phone,
      to,
      firstName: input.firstName,
      title: input.title,
      url: input.url,
      mediaUrl: input.mediaUrl || null,
      audience: input.audience,
      windowOpen: open,
      templateSid,
      previewBlocked: isVercelPreview(),
      now,
      prior,
      staffId: input.staffId || null,
    },
    {
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
          const admin = createServiceClient();
          const inserted = await admin.from("crm_whatsapp_messages").insert(row).select("id").maybeSingle();
          if (inserted.error?.code === "23505") return { error: "duplicate" as const };
          if (inserted.error || !inserted.data) {
            console.error("[partage]", inserted.error?.code || "insert");
            return { error: "failed" as const };
          }
          return { id: String((inserted.data as { id: string }).id) };
        } catch {
          return { error: "failed" as const };
        }
      },
      update: async (id, patch) => {
        try {
          const admin = createServiceClient();
          let query = admin.from("crm_whatsapp_messages").update(patch).eq("id", id);
          if (patch.status === "sent" || patch.status === "queued") query = query.neq("status", "failed");
          const updated = await query;
          if (updated.error) {
            console.error("[partage]", updated.error.code || "update");
            return false;
          }
          return true;
        } catch {
          return false;
        }
      },
      find: async (dedupeKey) => {
        try {
          const admin = createServiceClient();
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
      read: async (id) => {
        try {
          const admin = createServiceClient();
          const found = await admin.from("crm_whatsapp_messages").select("status, error").eq("id", id).maybeSingle();
          if (found.error || !found.data) return null;
          return found.data as { status: string; error: string | null };
        } catch {
          return null;
        }
      },
    }
  );
  if (!result.ok) console.error("[partage]", result.code);
  return result;
}
