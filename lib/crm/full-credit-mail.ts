import "server-only";

import { agencyEmailHtml } from "./email-html";
import { fullCreditAgencyNotice } from "./full-credit";
import { productionOnlySecret } from "./preview-secrets";
import { siteConfig } from "@/lib/site";

export type FullCreditMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fullCreditHtml(opts: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  footnote?: string;
}) {
  const paragraphs = opts.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 12px;line-height:1.55;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${escapeHtml(part).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
  return agencyEmailHtml({
    title: opts.title,
    preheader: opts.body.split("\n").find((line) => line.trim()) || opts.title,
    bodyHtml: paragraphs,
    ctaLabel: opts.ctaLabel,
    ctaHref: opts.ctaHref,
    footnote: opts.footnote,
  });
}

export function buildFullCreditAgencyMail(opts: { reference: string; hotelName: string; bookingId: string; to: string }): FullCreditMail {
  const note = fullCreditAgencyNotice(opts);
  const href = /^[0-9a-f-]{36}$/i.test(opts.bookingId)
    ? `${siteConfig.url}/admin/reservations/${opts.bookingId}`
    : `${siteConfig.url}/admin/reservations`;
  return {
    to: opts.to.trim(),
    subject: note.subject,
    text: `${note.text}\n${href}`,
    html: fullCreditHtml({
      title: note.subject,
      body: note.text,
      ctaLabel: "Ouvrir le dossier",
      ctaHref: href,
      footnote: "L’hôtel n’a pas reçu ce message.",
    }),
  };
}

export function buildFullCreditHotelMail(opts: { to: string; subject: string; body: string }): FullCreditMail {
  const reply = `mailto:${siteConfig.contactEmail}`;
  return {
    to: opts.to.trim(),
    subject: opts.subject,
    text: opts.body,
    html: fullCreditHtml({
      title: "Full credit — extras seulement",
      body: opts.body,
      ctaLabel: "Répondre à l’agence",
      ctaHref: reply,
      footnote: "Aucun numéro de carte dans ce message.",
    }),
  };
}

export async function deliverFullCreditMail(
  mail: FullCreditMail,
  deps: {
    apiKey?: string | null;
    from?: string;
    send?: (input: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;
  } = {}
) {
  const apiKey = deps.apiKey === undefined ? productionOnlySecret(process.env.RESEND_API_KEY) : deps.apiKey;
  if (!apiKey || !mail.to || !mail.text) return false;
  const fromAddress = deps.from || process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const from = `${siteConfig.name} <${fromAddress}>`;
  try {
    const send =
      deps.send ||
      (async (input) => {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { error: result.error };
      });
    const { error } = await send({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    if (error) {
      console.error("[full-credit] courrier non délivré");
      return false;
    }
    return true;
  } catch {
    console.error("[full-credit] courrier non délivré");
    return false;
  }
}

export async function notifyFullCreditAsked(opts: { reference: string; hotelName: string; bookingId: string }) {
  try {
    const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
    const mail = buildFullCreditAgencyMail({ ...opts, to });
    return await deliverFullCreditMail(mail);
  } catch {
    console.error("[full-credit] avis agence non délivré");
    return false;
  }
}
