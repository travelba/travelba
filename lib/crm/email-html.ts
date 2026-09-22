import { siteConfig } from "@/lib/site";

const NAVY = "#0B192C";
const GOLD = "#C5A880";
const CREAM = "#FAF9F6";
const MUTED = "#5a5c60";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** E-mail transactionnel — Sovereign Horizon (pas le rouge Aura). */
export function agencyEmailHtml(opts: {
  kicker?: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  footnote?: string;
}) {
  const kicker = escapeHtml(opts.kicker || "L’agence");
  const title = escapeHtml(opts.title);
  const ctaLabel = escapeHtml(opts.ctaLabel);
  const ctaHref = escapeHtml(opts.ctaHref);
  const footnote = opts.footnote
    ? `<p style="margin:0 0 8px;font-size:13px;color:${MUTED};line-height:1.5">${opts.footnote}</p>`
    : "";
  return `
    <div style="font-family:'Plus Jakarta Sans',Georgia,serif;background:${CREAM};padding:32px 16px">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;color:${NAVY};border:1px solid #e5e3dc">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD}">${kicker}</p>
        <h1 style="margin:0 0 16px;font-size:24px">${title}</h1>
        ${opts.bodyHtml}
        <p style="margin:24px 0">
          <a href="${ctaHref}" style="display:inline-block;background:${NAVY};color:${GOLD};text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600">
            ${ctaLabel}
          </a>
        </p>
        ${footnote}
        <p style="margin:24px 0 0;font-size:12px;color:${MUTED}">
          ${escapeHtml(siteConfig.name)} · ${escapeHtml(siteConfig.phoneDisplay)}
        </p>
      </div>
    </div>
  `;
}

export { escapeHtml };
