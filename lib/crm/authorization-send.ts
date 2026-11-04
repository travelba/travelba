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
  resolveConciergeContentSid,
  conciergeContentVariables,
  conciergeTemplateImage,
  liveConciergeImage,
  type ConciergeTemplate,
} from "./concierge-notices";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { sendContentTemplate } from "./whatsapp";
import { sendVisaGrantWhatsapp } from "./visa-grant-send";
import {
  isVisaGrantTemplate,
  visaGrantAuthorizationName,
  visaGrantDedupeKey,
  visaGrantPreview,
  visaGrantSendBlock,
} from "./visa-grant-whatsapp";

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
    grant?: {
      documentId: string;
      mime: string | null;
      fileName: string | null;
      firstName: string | null;
      lastName: string | null;
      country: string | null;
      docType: string | null;
    } | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.notice === "approuve") return sendApprovedGrant(admin, input);
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
    const sid = (await resolveConciergeContentSid(attempt.template)) || attempt.sid;
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

/** Cas approuvé : le fichier du visa part dans le message. Sans modèle, rien ne part. */
async function sendApprovedGrant(
  admin: Admin,
  input: {
    kind: AuthorizationKind;
    notice: AuthorizationCase;
    customerId: string;
    bookingId: string;
    travelerId: string;
    phone: string | null;
    name: string;
    again?: boolean;
    grant?: {
      documentId: string;
      mime: string | null;
      fileName: string | null;
      firstName: string | null;
      lastName: string | null;
      country: string | null;
      docType: string | null;
    } | null;
    optInAt?: string | null;
    optOutAt?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const preview = visaGrantPreview(
    input.name,
    visaGrantAuthorizationName({
      country: input.grant?.country || (input.kind === "esta" ? "US" : "GB"),
      docType: input.grant?.docType,
    })
  );
  if (!preview) return { ok: false, error: "Le message n’a pas pu être préparé." };
  const block = visaGrantSendBlock({
    phone: input.phone,
    optInAt: input.optInAt,
    optOutAt: input.optOutAt,
    file: input.grant ? { mime: input.grant.mime, fileName: input.grant.fileName } : null,
  });
  if (block) return { ok: false, error: block };
  const grant = input.grant;
  if (!grant) return { ok: false, error: "Le document du visa n’est pas dans l’espace." };

  const base = visaGrantDedupeKey(input.bookingId, grant.documentId);
  const { data: prior } = await admin
    .from("crm_whatsapp_messages")
    .select("id, status, template_key")
    .eq("dedupe_key", base)
    .maybeSingle();
  const previous = prior as { id: string; status: string; template_key?: string | null } | null;
  const sentGrant = previous?.status === "sent" && isVisaGrantTemplate(previous.template_key);
  if (sentGrant && !input.again) return { ok: true };

  const dedupe = sentGrant && input.again ? `${base}:${Date.now()}` : base;
  let rowId = previous && !sentGrant ? previous.id : "";
  if (!rowId) {
    const inserted = await admin
      .from("crm_whatsapp_messages")
      .insert({
        customer_id: input.customerId,
        booking_id: input.bookingId,
        dedupe_key: dedupe,
        direction: "outbound",
        template_key: "autorisation_validee",
        body: preview,
        status: "queued",
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      const raced = await admin.from("crm_whatsapp_messages").select("id, status, template_key").eq("dedupe_key", dedupe).maybeSingle();
      const winner = raced.data as { id: string; status: string; template_key?: string | null } | null;
      if (winner?.status === "sent" && isVisaGrantTemplate(winner.template_key) && !input.again) return { ok: true };
      if (!winner) return { ok: false, error: "Le message n’a pas pu être enregistré." };
      rowId = winner.id;
    } else {
      rowId = (inserted.data as { id: string }).id;
    }
  }

  const sent = await sendVisaGrantWhatsapp({
    phone: input.phone,
    documentId: grant.documentId,
    mime: grant.mime,
    storedName: grant.fileName,
    firstName: grant.firstName,
    lastName: grant.lastName,
    greetingName: input.name,
    country: grant.country,
    docType: grant.docType,
  });
  if (sent.ok) {
    await admin
      .from("crm_whatsapp_messages")
      .update({ status: "sent", twilio_sid: sent.sid, error: null, template_key: sent.template, body: sent.body })
      .eq("id", rowId);
    return { ok: true };
  }
  await admin.from("crm_whatsapp_messages").update({ status: "failed", error: sent.error }).eq("id", rowId);
  return { ok: false, error: sent.error };
}
