import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "@/lib/site";
import {
  authorizationChannelBlock,
  authorizationPreview,
  authorizationTemplateReady,
  authorizationTextTemplate,
  formatAuthorizationDate,
  type AuthorizationCase,
  type AuthorizationKind,
} from "./authorization-notice";
import {
  conciergeContentSid,
  conciergeContentVariables,
  conciergeTemplateImage,
  liveConciergeImage,
  type ConciergeTemplate,
} from "./concierge-notices";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { sendContentTemplate } from "./whatsapp";

type Admin = SupabaseClient;

export function authorizationDedupeKey(kind: AuthorizationKind, bookingId: string, travelerId: string, notice: AuthorizationCase) {
  return `${kind}:${bookingId}:${travelerId}:${authorizationTextTemplate(kind, notice)}`;
}

async function entrySuffix(admin: Admin, email: string, reference: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: cleanEmail });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: `/mon-compte/reservations/${reference}`,
    email: cleanEmail,
    channel: "whatsapp",
  });
  const code = entryCodeFromLink(link);
  if (!code) return null;
  return entryButtonSuffix(code);
}

/**
 * Envoie le modèle WhatsApp du cas, photo puis texte.
 * Le même modèle ne part qu’une fois pour ce voyageur et ce séjour, sauf envoi voulu.
 */
export async function sendAuthorizationWhatsapp(
  admin: Admin,
  input: {
    kind: AuthorizationKind;
    notice: AuthorizationCase;
    customerId: string;
    bookingId: string;
    travelerId: string;
    phone: string | null;
    email: string | null;
    name: string;
    place: string | null;
    reference: string;
    validUntil?: string | null;
    optInAt?: string | null;
    optOutAt?: string | null;
    again?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ready = authorizationTemplateReady(input.kind, input.notice);
  const preview = authorizationPreview({
    kind: input.kind,
    notice: input.notice,
    name: input.name,
    place: input.place,
    reference: input.reference,
    validUntil: input.validUntil,
  });
  if (!preview) return { ok: false, error: "Le lieu du séjour n’est pas assez précis pour ce message." };
  const block = authorizationChannelBlock({
    phone: input.phone,
    email: input.email,
    optInAt: input.optInAt,
    optOutAt: input.optOutAt,
    textSid: ready.textSid,
    photoSid: ready.photoSid,
  });
  if (block) return { ok: false, error: block };

  const base = authorizationDedupeKey(input.kind, input.bookingId, input.travelerId, input.notice);
  const { data: prior } = await admin
    .from("crm_whatsapp_messages")
    .select("id, status")
    .eq("dedupe_key", base)
    .maybeSingle();
  const previous = prior as { id: string; status: string } | null;
  if (previous?.status === "sent" && !input.again) return { ok: true };

  const suffix = await entrySuffix(admin, input.email || "", input.reference);
  if (!suffix) return { ok: false, error: "Le lien du séjour n’a pas pu être préparé." };

  const dedupe = previous?.status === "sent" && input.again ? `${base}:${Date.now()}` : base;
  let rowId = previous && previous.status !== "sent" ? previous.id : "";
  if (!rowId) {
    const inserted = await admin
      .from("crm_whatsapp_messages")
      .insert({
        customer_id: input.customerId,
        booking_id: input.bookingId,
        dedupe_key: dedupe,
        direction: "outbound",
        template_key: ready.text,
        body: preview,
        status: "queued",
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      const raced = await admin.from("crm_whatsapp_messages").select("id, status").eq("dedupe_key", dedupe).maybeSingle();
      const winner = raced.data as { id: string; status: string } | null;
      if (winner?.status === "sent" && !input.again) return { ok: true };
      if (!winner) return { ok: false, error: "Le message n’a pas pu être enregistré." };
      rowId = winner.id;
    } else {
      rowId = (inserted.data as { id: string }).id;
    }
  }

  const photoMedia = ready.photo ? await liveConciergeImage(conciergeTemplateImage(ready.photo)) : null;
  const attempts: { template: ConciergeTemplate; sid: string; media: string | null }[] = [];
  if (ready.photo && ready.photoSid && photoMedia) {
    attempts.push({ template: ready.photo, sid: ready.photoSid, media: photoMedia });
  }
  if (ready.textSid) attempts.push({ template: ready.text, sid: ready.textSid, media: null });
  if (!attempts.length) {
    await admin.from("crm_whatsapp_messages").delete().eq("id", rowId).eq("status", "queued");
    return { ok: false, error: "Le modèle n’est pas encore approuvé." };
  }

  let lastError = "Le message n’est pas parti.";
  for (const attempt of attempts) {
    const variables = conciergeContentVariables({
      template: attempt.template,
      buttonSuffix: suffix,
      place: input.place,
      reference: input.reference,
      mediaUrl: attempt.media,
      variable: input.name,
      date: formatAuthorizationDate(input.validUntil),
    });
    if (!variables) continue;
    const sid = conciergeContentSid(attempt.template) || attempt.sid;
    const result = await sendContentTemplate({ phone: input.phone, contentSid: sid, variables });
    if (result.ok) {
      await admin
        .from("crm_whatsapp_messages")
        .update({ status: "sent", twilio_sid: result.sid, error: null, template_key: attempt.template, body: preview })
        .eq("id", rowId);
      return { ok: true };
    }
    if (result.reason === "not_configured") lastError = "Le modèle n’est pas encore approuvé.";
    else if (result.reason === "no_phone") lastError = "Pas de téléphone pour WhatsApp.";
    else lastError = "WhatsApp a refusé le message.";
  }
  await admin.from("crm_whatsapp_messages").update({ status: "failed", error: lastError }).eq("id", rowId);
  return { ok: false, error: lastError };
}
