import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "./agency-log";
import { uploadCrmFile } from "./files";
import {
  invoiceMediaPath,
  invoiceObjectPath,
  INVOICE_MEDIA_FILE,
} from "./invoice-link";
import { loadInvoiceSnapshot } from "./invoice-context";
import { renderInvoicePdf } from "./invoice-pdf";
import { stripePayUrlOf } from "./invoice-document";
import {
  deliverInvoice,
  invoicePreview,
  invoiceSendBlocked,
  INVOICE_REPEAT_MS,
  type InvoiceChannel,
  type InvoicePreview,
} from "./invoice-send";
import { toE164 } from "./phone";
import { siteConfig } from "@/lib/site";
import { sendContentTemplate, whatsappAddress } from "./whatsapp";
import { sendWhatsappSession } from "./whatsapp-session";
import { agencyCopyCc } from "./outbound-mail";

export type InvoiceActor = { staffId: string | null; name: string };

export type InvoiceRequest = {
  confirmer?: boolean;
  email?: boolean;
  whatsapp?: boolean;
  lienStripe?: string | null;
  force?: boolean;
};

function channelsOf(input: InvoiceRequest): InvoiceChannel[] {
  const chosen: InvoiceChannel[] = [];
  if (input.email !== false) chosen.push("email");
  if (input.whatsapp !== false) chosen.push("whatsapp");
  return chosen;
}

async function recentSummaries(admin: SupabaseClient, bookingId: string) {
  const since = new Date(Date.now() - INVOICE_REPEAT_MS).toISOString();
  const { data, error } = await admin
    .from("crm_agency_journal")
    .select("summary")
    .eq("entity_type", "dossier")
    .eq("entity_id", bookingId)
    .eq("action", "send")
    .gte("occurred_at", since)
    .limit(8);
  if (error) return [];
  return ((data || []) as { summary?: string | null }[]).map((row) => row.summary || "");
}

export async function saveBookingPayLink(
  admin: SupabaseClient,
  bookingId: string,
  raw: string | null | undefined,
  staffId: string | null
) {
  if (raw == null) return { ok: true as const };
  const trimmed = raw.trim();
  if (!trimmed) {
    const { error } = await admin.from("crm_booking_pay_links").delete().eq("booking_id", bookingId);
    if (error) return { ok: false as const, error: "Le lien de paiement n’a pas été retiré." };
    return { ok: true as const };
  }
  const url = stripePayUrlOf(trimmed);
  if (!url) {
    return { ok: false as const, error: "Le lien doit être une adresse Stripe (buy, pay, checkout ou invoice)." };
  }
  const { error } = await admin.from("crm_booking_pay_links").upsert({
    booking_id: bookingId,
    stripe_pay_url: url,
    updated_by: staffId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: "Le lien de paiement n’a pas été enregistré." };
  return { ok: true as const };
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  filename: string;
  pdf: Uint8Array;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false };
  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    cc: agencyCopyCc(input.to),
    subject: input.subject,
    html: input.html,
    text: input.text,
    attachments: [{ filename: input.filename, content: Buffer.from(input.pdf) }],
  });
  return { ok: !error };
}

export async function runInvoiceSend(
  admin: SupabaseClient,
  bookingId: string,
  input: InvoiceRequest,
  actor: InvoiceActor
): Promise<{ status: number; body: InvoicePreview | Record<string, unknown> }> {
  if (input.lienStripe !== undefined) {
    const saved = await saveBookingPayLink(admin, bookingId, input.lienStripe, actor.staffId);
    if (!saved.ok) return { status: 400, body: { error: saved.error } };
  }
  const snapshot = await loadInvoiceSnapshot(admin, bookingId);
  if (!snapshot) return { status: 404, body: { error: "Aucune facture à envoyer pour ce séjour." } };
  const summaries = await recentSummaries(admin, bookingId);
  const recent = invoiceSendBlocked(summaries, false);
  const preview = invoicePreview(snapshot, recent);
  if (input.confirmer !== true) return { status: 200, body: preview };
  if (invoiceSendBlocked(summaries, input.force === true)) {
    return { status: 409, body: { error: "Un envoi vient de partir. Attendez quelques minutes, ou forcez.", ...preview, envoye: false } };
  }
  const channels = channelsOf(input);
  if (!channels.length) return { status: 400, body: { error: "Choisissez l’e-mail ou WhatsApp." } };
  const pdf = await renderInvoicePdf(snapshot.document);
  const objectPath = invoiceObjectPath(snapshot.customerId, snapshot.bookingId);
  const mediaPath = invoiceMediaPath(snapshot.customerId, snapshot.bookingId);
  const mediaUrl = mediaPath ? `${siteConfig.url}/api/whatsapp/factures/${mediaPath}` : null;
  const phone = toE164(snapshot.phone || "", "FR");
  const delivery = await deliverInvoice(snapshot, channels, {
    pdf,
    sendEmail,
    sendSession: async (message) => {
      const sent = await sendWhatsappSession(message);
      return sent.ok ? { ok: true, sid: sent.sid } : { ok: false };
    },
    sendTemplate: async (message) => {
      const sent = await sendContentTemplate(message);
      return sent.ok ? { ok: true, sid: sent.sid } : { ok: false };
    },
    upload: async (path, bytes) => {
      await uploadCrmFile(path, Buffer.from(bytes), "application/pdf", { upsert: true });
    },
    objectPath,
    mediaPath,
    mediaUrl,
    sessionTo: whatsappAddress(phone || snapshot.phone),
  });
  const summary = `${delivery.journal}, par ${actor.name}.`.slice(0, 500);
  await recordAgencyJournal({
    staffId: actor.staffId,
    action: "send",
    entityType: "dossier",
    entityId: bookingId,
    summary,
    path: `/admin/reservations/${bookingId}`,
    diff: {
      numero: snapshot.document.number,
      reste: snapshot.document.balance,
      rib: snapshot.document.paymentMissing ? "manquant" : "present",
      lien: Boolean(snapshot.document.stripeUrl),
      email: delivery.email,
      whatsapp: delivery.whatsapp,
    },
  });
  if (channels.includes("whatsapp")) {
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: snapshot.customerId,
      booking_id: bookingId,
      direction: "outbound",
      template_key: delivery.whatsapp === "envoye" && snapshot.templateSid && !snapshot.windowOpen ? "facture_paiement" : "facture_session",
      body: snapshot.document.message.slice(0, 4000),
      status: delivery.whatsapp === "envoye" ? "sent" : "failed",
      error: delivery.whatsapp === "envoye" ? null : preview.whatsapp.raison,
      phone: phone || null,
      author_staff_id: actor.staffId,
      media_path: objectPath,
      twilio_sid: delivery.twilio_sid,
      dedupe_key: `facture:${bookingId}:${Date.now()}`,
      payload: { actor: actor.name },
    });
  }
  return {
    status: delivery.ok ? 200 : 400,
    body: {
      envoye: delivery.ok,
      statut: delivery.statut,
      message: delivery.message,
      email: delivery.email,
      whatsapp: delivery.whatsapp,
      twilio_sid: delivery.twilio_sid,
      auteur: actor.name,
      apercu: snapshot.document.message,
      numero: snapshot.document.number,
      reste_label: snapshot.document.balanceLabel,
      fichier: INVOICE_MEDIA_FILE,
    },
  };
}
