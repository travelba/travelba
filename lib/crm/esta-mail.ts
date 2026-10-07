import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { agencyCopyCc } from "@/lib/crm/outbound-mail";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { siteConfig } from "@/lib/site";
import { maskPassportInText } from "@/lib/crm/esta";

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const NAVY = "#0B192C";

type Draft = {
  subject: string;
  text: string;
  intro?: string;
};

export function buildEstaHtml(input: { title: string; paragraphs: string[]; href?: string; cta?: string }) {
  const bodyHtml = input.paragraphs
    .filter(Boolean)
    .map(
      (part) =>
        `<p style="margin:0 0 12px;line-height:1.5;font-family:${FONT};color:${NAVY}">${escapeHtml(part)}</p>`
    )
    .join("");
  return agencyEmailHtml({
    title: input.title,
    preheader: input.paragraphs[0] || input.title,
    bodyHtml,
    ...(input.cta && input.href ? { ctaLabel: input.cta, ctaHref: input.href } : {}),
    footnote: "Message ESTA. Aucun numéro de passeport en clair.",
  });
}

export function estaAgencyMail(
  input: { subject: string; text: string; intro: string; href: string },
  passportNumbers: string[] = []
) {
  const subject = maskPassportInText(input.subject, passportNumbers);
  const text = maskPassportInText(input.text, passportNumbers);
  const intro = maskPassportInText(input.intro, passportNumbers);
  return {
    subject,
    text,
    html: buildEstaHtml({
      title: subject,
      paragraphs: [intro],
      href: input.href,
      cta: "Ouvrir le dossier",
    }),
  };
}

export function estaClientMail(
  draft: Draft,
  href: string,
  passportNumbers: string[] = [],
  options?: { offerApply?: boolean }
) {
  const subject = maskPassportInText(draft.subject, passportNumbers);
  const text = maskPassportInText(draft.text, passportNumbers);
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const offerApply = options?.offerApply !== false;
  return {
    subject,
    text,
    html: buildEstaHtml({
      title: "Votre ESTA",
      paragraphs,
      ...(offerApply ? { href, cta: "Faire l’ESTA" } : {}),
    }),
  };
}

export async function deliverEstaMail(
  mail: { to: string; subject: string; html: string; text: string; ccAgency?: boolean },
  deps: {
    apiKey?: string | null;
    from?: string;
    send?: (input: { from: string; to: string; cc?: string[]; subject: string; html: string; text: string }) => Promise<{ error: unknown }>;
  } = {}
) {
  const apiKey = deps.apiKey === undefined ? productionOnlySecret(process.env.RESEND_API_KEY) : deps.apiKey;
  if (!apiKey || !mail.to || !mail.text) return false;
  const fromAddress = deps.from || process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const from = `${siteConfig.name} <${fromAddress}>`;
  const cc = mail.ccAgency === false ? undefined : agencyCopyCc(mail.to);
  try {
    const send =
      deps.send ||
      (async (input) => {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
          from: input.from,
          to: [input.to],
          cc: input.cc,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { error: result.error };
      });
    const { error } = await send({ from, to: mail.to, cc, subject: mail.subject, html: mail.html, text: mail.text });
    if (error) {
      console.info("[esta] e-mail non délivré");
      return false;
    }
    return true;
  } catch {
    console.info("[esta] e-mail non délivré");
    return false;
  }
}
