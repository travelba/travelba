import { agencyEmailHtml, escapeHtml } from "./email-html";
import { deliverServiceRequestMail, type ServiceRequestMail } from "./service-request-mail";
import { HANDOFF_LABELS, type HandoffKind } from "./whatsapp-concierge";
import { siteConfig } from "@/lib/site";

const NAVY = "#0B192C";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function oneLine(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

export function buildConciergeAlert(input: {
  kind: HandoffKind;
  body: string;
  customerId: string | null;
  bookingId: string | null;
  phone: string | null;
  to: string;
}): ServiceRequestMail | null {
  const to = input.to.trim();
  if (!to) return null;
  const label = HANDOFF_LABELS[input.kind] || "Demande";
  const excerpt = oneLine(input.body).slice(0, 500);
  const href = input.customerId
    ? `${siteConfig.url}/admin/clients/${input.customerId}`
    : `${siteConfig.url}/admin?discussions=non-lus`;
  const stay = input.bookingId ? `${siteConfig.url}/admin/reservations/${input.bookingId}` : "";
  const subject = oneLine(`WhatsApp · ${label}`).slice(0, 140);
  const intro = input.customerId
    ? `Un client a écrit sur WhatsApp. ${label}.`
    : `Un numéro inconnu a écrit sur WhatsApp. ${label}.`;
  const rows = [
    excerpt ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;font-family:${FONT};color:${NAVY}">${escapeHtml(excerpt)}</p>` : "",
    input.phone && !input.customerId
      ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;font-family:${FONT};color:${NAVY}">Téléphone : ${escapeHtml(input.phone)}</p>`
      : "",
    stay
      ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;font-family:${FONT};color:${NAVY}"><a href="${escapeHtml(stay)}">Ouvrir le séjour</a></p>`
      : "",
  ].join("");
  const html = agencyEmailHtml({
    title: label,
    preheader: intro,
    bodyHtml: `<p style="margin:0 0 18px;font-size:16px;line-height:1.5;font-family:${FONT};color:${NAVY}">${escapeHtml(intro)}</p>${rows}`,
    ctaLabel: input.customerId ? "Ouvrir la fiche" : "Ouvrir la file",
    ctaHref: href,
    footnote: "Rien n’a été modifié sur le séjour ni sur le grand livre.",
  });
  const text = [
    subject,
    intro,
    excerpt,
    input.phone && !input.customerId ? input.phone : "",
    stay,
    href,
    "Rien n’a été modifié sur le séjour ni sur le grand livre.",
  ]
    .filter(Boolean)
    .join("\n");
  return { to, subject, html, text };
}

/** N’envoie rien si Resend n’est pas configuré (aperçu compris). */
export async function notifyConciergeRequest(input: {
  kind: HandoffKind;
  body: string;
  customer_id: string | null;
  booking_id: string | null;
  phone: string | null;
}): Promise<boolean> {
  try {
    const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
    const mail = buildConciergeAlert({
      kind: input.kind,
      body: input.body,
      customerId: input.customer_id,
      bookingId: input.booking_id,
      phone: input.phone,
      to,
    });
    if (!mail) return false;
    return await deliverServiceRequestMail(mail);
  } catch {
    console.error("[whatsapp-concierge] alerte non délivrée");
    return false;
  }
}
