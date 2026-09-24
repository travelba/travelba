import { siteConfig } from "@/lib/site";

const NAVY = "#0B192C";
const GOLD = "#C5A880";
const CREAM = "#FAF9F6";
const MUTED = "#5C6570";
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** « Simon, Iony » → « Simon et Iony ». Un seul prénom reste tel quel. */
export function greetingName(firstName: string | null | undefined) {
  const parts = (firstName || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** E-mail transactionnel — Sovereign Horizon (pas le rouge Aura). */
export function agencyEmailHtml(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  footnote?: string;
  preheader?: string;
}) {
  const title = escapeHtml(opts.title);
  const ctaLabel = escapeHtml(opts.ctaLabel);
  const ctaHref = escapeHtml(opts.ctaHref);
  const preheader = escapeHtml(opts.preheader || opts.title);
  const phone = escapeHtml(siteConfig.phoneDisplay);
  const email = escapeHtml(siteConfig.contactEmail);
  const address = escapeHtml(siteConfig.address.full);
  const name = escapeHtml(siteConfig.name);
  const footnote = opts.footnote
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${MUTED};font-family:${FONT}">${opts.footnote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="format-detection" content="telephone=no,address=no,email=no">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:${NAVY};padding:22px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:${NAVY};border:1px solid ${GOLD};border-radius:8px;width:36px;height:36px;text-align:center;vertical-align:middle;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:0.08em;color:${GOLD};">TBA</td>
                <td style="padding-left:12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD};">Travel Business Agency</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 28px;color:${NAVY};font-family:${FONT};">
            <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;color:${NAVY};">${title}</h1>
            ${opts.bodyHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
              <tr>
                <td align="center" bgcolor="${NAVY}" style="background:${NAVY};border-radius:12px;">
                  <a href="${ctaHref}" style="display:block;padding:16px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:${GOLD};text-decoration:none;">${ctaLabel}</a>
                </td>
              </tr>
            </table>
            ${footnote}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px 22px;border-top:1px solid ${GOLD};font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
            <p style="margin:0;color:${MUTED};">${name}</p>
            <p style="margin:0;color:${MUTED};">${address}</p>
            <p style="margin:0;">
              <a href="tel:+${siteConfig.whatsappNumber}" style="color:${MUTED};text-decoration:none;">${phone}</a>
              <span style="color:${MUTED};"> · </span>
              <a href="mailto:${email}" style="color:${MUTED};text-decoration:none;">${email}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export { escapeHtml };
