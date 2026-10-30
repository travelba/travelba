const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MediaToken =
  | { kind: "sample"; slot: "salle" | "plat" | "carte" }
  | { kind: "restaurant"; id: string; slot: "salle" | "plat" | "carte" };

/** `exemple.salle` pour l’approbation Meta, ou `{uuid}.salle`. */
export function parseMediaToken(raw: string): MediaToken | null {
  const token = decodeURIComponent(raw || "").trim().toLowerCase();
  const sample = token.match(/^exemple\.(salle|plat|carte)$/);
  if (sample) return { kind: "sample", slot: sample[1] as MediaToken["slot"] };
  const live = token.match(/^([0-9a-f-]{36})\.(salle|plat|carte)$/);
  if (!live || !UUID.test(live[1])) return null;
  return { kind: "restaurant", id: live[1], slot: live[2] as MediaToken["slot"] };
}

export function isPrivateAddress(address: string) {
  const host = address.trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  if (host.includes(":")) {
    if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return true;
  }
  return false;
}

/** https public. Pas d’identifiant dans l’URL, pas d’adresse privée. */
export function publicHttpsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isPrivateAddress(url.hostname)) return null;
  return url.toString();
}
