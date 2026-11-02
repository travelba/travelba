import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AGENCY_GOOGLE_DOMAIN } from "./agency-access";
import { colleagueEmailError, normalizeColleagueEmail } from "./staff-team";

const PREFIX = /^tbk_[a-f0-9]{8}$/;

/** Prénom affiché, ex. « Raphael ». Sinon la partie locale de l’e-mail. */
export function staffKeyName(fullName: string | null | undefined, email?: string | null) {
  const trimmed = (fullName || "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0] || trimmed;
  const local = (email || "").split("@")[0] || "";
  if (!local) return "Agence";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** Identifiant d’acteur MCP : lettres minuscules, sans accent. */
export function mcpActorSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 32);
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(slug) ? slug : "mcp";
}

export function hashMcpApiKey(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mcpApiKeyHashEquals(token: string, storedHex: string) {
  if (!/^[a-f0-9]{64}$/.test(storedHex)) return false;
  const given = createHash("sha256").update(token, "utf8").digest();
  const expected = Buffer.from(storedHex, "hex");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(given, expected);
}

/** Préfixe visible `tbk_` + 8 hex. Null si ce n’est pas une clé nominative. */
export function personalKeyPrefix(token: string) {
  const prefix = token.slice(0, 12);
  if (!PREFIX.test(prefix) || token.length <= 13 || token[12] !== "_") return null;
  return prefix;
}

export function isPersonalApiKey(token: string) {
  return personalKeyPrefix(token) !== null;
}

/** Clé complète, préfixe et empreinte. La clé en clair ne sort que d’ici. */
export function issueMcpApiKey() {
  const prefix = `tbk_${randomBytes(4).toString("hex")}`;
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { prefix, token, hash: hashMcpApiKey(token) };
}

export function apiKeyUsable(
  row: { revokedAt: string | null; expiresAt: string | null; staffActive: boolean },
  now = Date.now()
) {
  if (!row.staffActive) return false;
  if (row.revokedAt) return false;
  if (row.expiresAt) {
    const expires = Date.parse(row.expiresAt);
    if (!Number.isFinite(expires) || expires <= now) return false;
  }
  return true;
}

/** Fin du jour UTC. Vide : pas d’expiration. */
export function parseKeyExpiry(value: string | null | undefined, now = Date.now()): { expiresAt: string | null } | { error: string } {
  const raw = (value || "").trim();
  if (!raw) return { expiresAt: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: "Date d’expiration invalide (AAAA-MM-JJ)." };
  const end = Date.parse(`${raw}T23:59:59.999Z`);
  if (!Number.isFinite(end)) return { error: "Date d’expiration invalide (AAAA-MM-JJ)." };
  if (end <= now) return { error: "La date d’expiration est déjà passée." };
  return { expiresAt: new Date(end).toISOString() };
}

export function mcpKeyLabelError(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "Indiquez un libellé.";
  if (trimmed.length > 80) return "Le libellé est trop long.";
  return null;
}

/** Ajout d’un membre par le MCP : adresse de l’agence seulement. */
export function mcpMemberEmailError(value: string) {
  const email = normalizeColleagueEmail(value);
  const base = colleagueEmailError(email);
  if (base) return base;
  if (!email.endsWith(`@${AGENCY_GOOGLE_DOMAIN}`)) return "L’adresse doit être @travelba.fr.";
  return null;
}

export function memberNameFromEmail(email: string) {
  const local = normalizeColleagueEmail(email).split("@")[0] || "";
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(" ") || "Collègue";
}

export const MCP_MEMBER_ROLES = ["admin", "agent"] as const;
export type McpMemberRole = (typeof MCP_MEMBER_ROLES)[number];

export function parseMcpMemberRole(value: unknown): McpMemberRole | null {
  if (value === "admin" || value === "agent") return value;
  return null;
}
