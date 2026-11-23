import { agencyEmailHtml } from "./email-html";
import { signupMailCopy, adminSignupNotice } from "./signup";

function paragraphs(lines: string[]) {
  return lines
    .filter((line) => line.trim())
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${line
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>`
    )
    .join("");
}

export function signupEmailHtml(kind: Parameters<typeof signupMailCopy>[0], input: Parameters<typeof signupMailCopy>[1]) {
  const copy = signupMailCopy(kind, input);
  return {
    subject: copy.subject,
    html: agencyEmailHtml({
      title: copy.title,
      bodyHtml: paragraphs(copy.paragraphs),
      ctaLabel: copy.cta || undefined,
      ctaHref: copy.href || undefined,
      preheader: copy.subject,
    }),
  };
}

export function adminSignupEmailHtml(input: { name: string; href: string }) {
  const copy = adminSignupNotice(input);
  return {
    subject: copy.subject,
    html: agencyEmailHtml({
      title: copy.title,
      bodyHtml: paragraphs(copy.paragraphs),
      ctaLabel: copy.cta,
      ctaHref: copy.href,
      preheader: copy.subject,
    }),
  };
}
