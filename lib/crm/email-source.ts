/** Taille max conservée pour relire le mail dans la revue agence. */
export const EMAIL_BODY_CAP = 200_000;

export function clipEmailBody(value: string | null | undefined) {
  const text = String(value || "");
  if (text.length <= EMAIL_BODY_CAP) return text;
  return text.slice(0, EMAIL_BODY_CAP);
}

const DROP_TAGS =
  /<\s*(script|style|iframe|object|embed|form|link|meta|base|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DROP_VOID =
  /<\s*(script|style|iframe|object|embed|form|link|meta|base|svg|math)\b[^>]*\/?\s*>/gi;

function safeUrl(value: string) {
  const url = value.trim().replace(/^['"]|['"]$/g, "");
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return "";
}

function sanitizeTag(tag: string) {
  const match = tag.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
  if (!match) return "";
  const closing = Boolean(match[1]);
  const name = match[2].toLowerCase();
  const allowed = new Set([
    "p",
    "br",
    "div",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "a",
    "strong",
    "b",
    "em",
    "i",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "img",
    "hr",
  ]);
  if (!allowed.has(name)) return "";
  if (closing) return name === "br" || name === "img" || name === "hr" ? "" : `</${name}>`;
  if (name === "br" || name === "hr") return `<${name}>`;
  if (name === "a") {
    const href = tag.match(/\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i)?.[1] || "";
    const url = safeUrl(href);
    return url ? `<a href="${url.replace(/"/g, "&quot;")}" rel="noreferrer noopener">` : "<a>";
  }
  if (name === "img") {
    const src = tag.match(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i)?.[1] || "";
    const url = safeUrl(src);
    const alt = tag.match(/\balt\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i)?.[1] || "";
    if (!url) return "";
    const cleanAlt = alt.replace(/^['"]|['"]$/g, "").replace(/[<>"]/g, "");
    return `<img src="${url.replace(/"/g, "&quot;")}" alt="${cleanAlt}">`;
  }
  return `<${name}>`;
}

/** HTML de mail fournisseur, réduit aux balises de lecture. */
export function sanitizeEmailHtml(html: string | null | undefined) {
  const raw = clipEmailBody(html);
  if (!raw.trim()) return "";
  const stripped = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(DROP_TAGS, "")
    .replace(DROP_VOID, "");
  return stripped.replace(/<\/?[^>]+>/g, (tag) => sanitizeTag(tag));
}
