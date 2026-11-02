import { agencyEmailHtml, escapeHtml } from "./email-html";
import {
  invoiceTemplateSubmission,
  invoiceTemplateVariables,
  type InvoiceDocument,
} from "./invoice-document";
import type { InvoiceSnapshot } from "./invoice-context";
import { siteConfig } from "@/lib/site";

export const INVOICE_REPEAT_MS = 5 * 60 * 1000;

export type InvoiceChannel = "email" | "whatsapp";

export type InvoicePreview = {
  envoye: false;
  numero: string;
  reference: string;
  titre: string;
  reste: number;
  reste_label: string;
  acomptes_label: string;
  echeance: string;
  rib: "present" | "manquant";
  lien_stripe: string | null;
  objet: string;
  apercu: string;
  fichier: string;
  email: { pret: boolean; raison: string | null };
  whatsapp: { pret: boolean; raison: string | null; fenetre: boolean };
  manques: string[];
  modele: string | null;
  envoi_recent: boolean;
};

function emailReady(email: string | null) {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function invoiceChannelState(snapshot: InvoiceSnapshot) {
  const email = emailReady(snapshot.email)
    ? { pret: true, raison: null }
    : { pret: false, raison: "Ce client n’a pas d’e-mail de facturation." };
  let whatsappRaison: string | null = null;
  if (snapshot.previewBlocked) whatsappRaison = "Envoi WhatsApp coupé sur l’aperçu.";
  else if (snapshot.whatsappOptOut) whatsappRaison = "Ce client a coupé WhatsApp.";
  else if (!snapshot.phone) whatsappRaison = "Ce client n’a pas de téléphone.";
  else if (!snapshot.windowOpen && !snapshot.templateSid) {
    whatsappRaison =
      "Hors des 24 heures, et le modèle WhatsApp de la facture n’est pas encore approuvé.";
  }
  return {
    email,
    whatsapp: { pret: !whatsappRaison, raison: whatsappRaison, fenetre: snapshot.windowOpen },
  };
}

export function invoiceSendBlocked(summaries: string[], force: boolean) {
  if (force) return false;
  return summaries.some((summary) => summary.startsWith("Facture pro forma") && /envoyé/.test(summary));
}

export function invoicePreview(snapshot: InvoiceSnapshot, recent: boolean): InvoicePreview {
  const doc = snapshot.document;
  const channels = invoiceChannelState(snapshot);
  const manques = [...doc.missing];
  if (!channels.email.pret && channels.email.raison) manques.push(channels.email.raison);
  if (!channels.whatsapp.pret && channels.whatsapp.raison) manques.push(channels.whatsapp.raison);
  return {
    envoye: false,
    numero: doc.number,
    reference: doc.reference,
    titre: doc.title,
    reste: doc.balance,
    reste_label: doc.balanceLabel,
    acomptes_label: doc.depositsLabel,
    echeance: doc.dueLabel,
    rib: doc.paymentMissing ? "manquant" : "present",
    lien_stripe: doc.stripeUrl,
    objet: doc.subject,
    apercu: doc.message,
    fichier: doc.filename,
    email: { pret: channels.email.pret, raison: channels.email.raison },
    whatsapp: channels.whatsapp,
    manques,
    modele: channels.whatsapp.pret && snapshot.templateSid ? null : invoiceTemplateSubmission(),
    envoi_recent: recent,
  };
}

export function invoiceMail(doc: InvoiceDocument) {
  const paragraphs = doc.message.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const bodyHtml = paragraphs
    .map(
      (part) =>
        `<p style="margin:0 0 12px;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  return {
    subject: doc.subject,
    text: doc.message,
    html: agencyEmailHtml({
      title: doc.subject,
      preheader: `Reste à payer ${doc.balanceLabel}`,
      bodyHtml,
      ...(doc.stripeUrl ? { ctaLabel: "Payer par carte", ctaHref: doc.stripeUrl } : {}),
      footnote: `${siteConfig.legal.legalName} — facture pro forma`,
    }),
  };
}

export type InvoiceDelivery = {
  ok: boolean;
  statut: "envoye" | "partiel" | "refuse" | "echec";
  message: string;
  email: "envoye" | "ignore" | "echec";
  whatsapp: "envoye" | "ignore" | "echec";
  twilio_sid: string | null;
  journal: string;
};

export async function deliverInvoice(
  snapshot: InvoiceSnapshot,
  channels: InvoiceChannel[],
  deps: {
    pdf: Uint8Array;
    sendEmail: (input: { to: string; subject: string; html: string; text: string; filename: string; pdf: Uint8Array }) => Promise<{ ok: boolean }>;
    sendSession: (input: { to: string; body: string; mediaUrl: string }) => Promise<{ ok: boolean; sid?: string }>;
    sendTemplate: (input: { phone: string; contentSid: string; variables: Record<string, string> }) => Promise<{ ok: boolean; sid?: string }>;
    upload: (path: string, pdf: Uint8Array) => Promise<void>;
    objectPath: string | null;
    mediaPath: string | null;
    mediaUrl: string | null;
    sessionTo: string | null;
  }
): Promise<InvoiceDelivery> {
  const state = invoiceChannelState(snapshot);
  const wantEmail = channels.includes("email");
  const wantWhatsapp = channels.includes("whatsapp");
  let email: InvoiceDelivery["email"] = "ignore";
  let whatsapp: InvoiceDelivery["whatsapp"] = "ignore";
  let sid: string | null = null;

  if (wantEmail) {
    if (state.email.pret && snapshot.email) {
      const mail = invoiceMail(snapshot.document);
      const sent = await deps.sendEmail({
        to: snapshot.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        filename: snapshot.document.filename,
        pdf: deps.pdf,
      });
      email = sent.ok ? "envoye" : "echec";
    } else email = "echec";
  }

  if (wantWhatsapp) {
    whatsapp = "echec";
    if (state.whatsapp.pret && snapshot.phone && deps.objectPath && deps.mediaUrl && deps.mediaPath) {
      let stored = false;
      try {
        await deps.upload(deps.objectPath, deps.pdf);
        stored = true;
      } catch {
        stored = false;
      }
      if (stored && snapshot.templateSid) {
        const variables = invoiceTemplateVariables(snapshot.document, deps.mediaPath);
        if (variables) {
          const sent = await deps.sendTemplate({
            phone: snapshot.phone,
            contentSid: snapshot.templateSid,
            variables,
          });
          if (sent.ok) {
            whatsapp = "envoye";
            sid = sent.sid || null;
          }
        }
      }
      if (whatsapp !== "envoye" && stored && snapshot.windowOpen && deps.sessionTo) {
        const sent = await deps.sendSession({
          to: deps.sessionTo,
          body: snapshot.document.message,
          mediaUrl: deps.mediaUrl,
        });
        if (sent.ok) {
          whatsapp = "envoye";
          sid = sent.sid || null;
        }
      }
    }
  }

  const sent = [email, whatsapp].filter((item) => item === "envoye").length;
  const asked = [wantEmail, wantWhatsapp].filter(Boolean).length;
  const statut: InvoiceDelivery["statut"] =
    asked === 0 ? "refuse" : sent === asked ? "envoye" : sent > 0 ? "partiel" : "echec";
  const bits = [
    wantEmail ? `e-mail ${email === "envoye" ? "envoyé" : "refusé"}` : "",
    wantWhatsapp ? `WhatsApp ${whatsapp === "envoye" ? "envoyé" : "refusé"}` : "",
  ].filter(Boolean);
  const message =
    statut === "envoye"
      ? "Facture envoyée."
      : statut === "partiel"
        ? "La facture est partie sur un seul canal."
        : "La facture n’a pas été envoyée.";
  return {
    ok: sent > 0,
    statut,
    message,
    email,
    whatsapp,
    twilio_sid: sid,
    journal: `Facture pro forma n° ${snapshot.document.number} : ${bits.join(", ")}`,
  };
}
