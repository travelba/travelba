import { Resend } from "resend";
import { siteConfig } from "@/lib/site";
import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { AGENCY_MAIL_COPY, accessNoticeCopy, type AccessNoticeKind } from "@/lib/crm/outbound-mail";

/**
 * Prévient l’agence qu’une invitation est partie, sans le lien.
 * Best-effort : un échec ne bloque pas l’invitation.
 */
export async function sendAgencyAccessNotice(input: {
  apiKey: string;
  from: string;
  kind: AccessNoticeKind;
  firstName: string | null | undefined;
  origin: string;
}) {
  const copy = accessNoticeCopy({ kind: input.kind, firstName: input.firstName });
  try {
    const resend = new Resend(input.apiKey);
    const { error } = await resend.emails.send({
      from: `${siteConfig.name} <${input.from}>`,
      to: [AGENCY_MAIL_COPY],
      subject: copy.subject,
      html: agencyEmailHtml({
        title: copy.subject,
        preheader: copy.body,
        bodyHtml: `<p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${escapeHtml(copy.body)}</p>`,
        ctaLabel: input.kind === "collegue" ? "Ouvrir l’équipe" : "Ouvrir les clients",
        ctaHref: `${input.origin.replace(/\/$/, "")}${input.kind === "collegue" ? "/admin/equipe" : "/admin/clients"}`,
      }),
    });
    if (error) console.error("[access-notice] non envoyé");
    return !error;
  } catch {
    console.error("[access-notice] non envoyé");
    return false;
  }
}
