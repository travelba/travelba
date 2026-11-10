import { AsyncLocalStorage } from "node:async_hooks";
import { cronAuthorized } from "./cron-auth";
import { isPersonalApiKey } from "./mcp-api-key";
import { isVercelPreview, productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";

/** Jeton du MCP Grok Bot. Vide sur une preview, même si la variable est encore là. */
export function mcpSecret() {
  return productionOnlySecret(process.env.TRAVELBA_MCP_TOKEN);
}

const ACTOR = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MIN_PASSPORT_SECRET = 16;

export type McpStaffAccess = {
  id: string;
  role: string;
  /** Prénom affiché, ex. Raphael. */
  name: string;
  keyId: string;
  /** Droits effectifs du rôle. Absent : les défauts de `roleAllows`. */
  allows?: Record<string, boolean> | null;
};

export type McpAccess = {
  /** `mcp` : jeton général. Sinon le nom du jeton, ou le prénom en slug d’une clé nominative. */
  actor: string;
  /** Jeton cité dans `TRAVELBA_MCP_PASSPORT_TOKENS`. Une clé nominative ne l’ouvre pas. */
  passport: boolean;
  /** Jeton cité dans `TRAVELBA_MCP_CARD_TOKENS`. Absent : pas de lecture du numéro. */
  cards?: boolean;
  /**
   * Créer ou geler une carte. Vrai pour le jeton général, un jeton carte,
   * et une clé `tbk_` dont le membre a `create_pliant_card`. Pas la lecture du numéro.
   */
  cards_create?: boolean;
  /** Présent seulement pour une clé nominative. Les jetons d’environnement n’ont pas de collègue. */
  staff?: McpStaffAccess;
};

export type PersonalMcpLookup = (token: string) => Promise<McpAccess | null>;

const accessStore = new AsyncLocalStorage<McpAccess>();
const DENIED: McpAccess = Object.freeze({ actor: "mcp", passport: false, cards: false, cards_create: false });
const warnedSharedSecret = new Set<string>();

type NamedGrant = { actor: string; secret: string };

function namedGrants(envValue: string | undefined, label: string): NamedGrant[] {
  const raw = productionOnlySecret(envValue);
  if (!raw) return [];
  const general = mcpSecret();
  const grants: NamedGrant[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const split = entry.indexOf(":");
    if (split <= 0) continue;
    const actor = entry.slice(0, split).trim().toLowerCase();
    const secret = entry.slice(split + 1).trim();
    if (actor === "mcp" || !ACTOR.test(actor) || secret.length < MIN_PASSPORT_SECRET) continue;
    if (general && secretEquals(secret, general)) {
      if (!warnedSharedSecret.has(label)) {
        warnedSharedSecret.add(label);
        console.error(`[mcp] ${label} jeton ignoré : identique au jeton général`);
      }
      continue;
    }
    grants.push({ actor, secret });
  }
  return grants;
}

function passportGrants() {
  return namedGrants(process.env.TRAVELBA_MCP_PASSPORT_TOKENS, "passeport");
}

function cardGrants() {
  return namedGrants(process.env.TRAVELBA_MCP_CARD_TOKENS, "carte");
}

function matchingGrant(authorizationHeader: string | null | undefined, grants: NamedGrant[]) {
  for (const grant of grants) {
    if (cronAuthorized(authorizationHeader, grant.secret)) return grant;
  }
  return null;
}

/**
 * Jeton général : CRM, création et gel de carte, sans lecture du numéro.
 * Un jeton passeport ne lit ni ne crée les cartes. Un jeton carte lit le numéro.
 * Le même secret dans les deux variables ouvre les deux.
 */
export function mcpAccessFromAuthorization(authorizationHeader: string | null | undefined): McpAccess | null {
  const passport = matchingGrant(authorizationHeader, passportGrants());
  const cards = matchingGrant(authorizationHeader, cardGrants());
  if (passport || cards) {
    const actor =
      passport && cards ? (passport.actor === cards.actor ? passport.actor : cards.actor) : (cards ?? passport)!.actor;
    return Object.freeze({
      actor,
      passport: Boolean(passport),
      cards: Boolean(cards),
      cards_create: Boolean(cards),
    });
  }
  if (cronAuthorized(authorizationHeader, mcpSecret())) {
    return Object.freeze({ actor: "mcp", passport: false, cards: false, cards_create: true });
  }
  return null;
}

export function mcpAuthorized(authorizationHeader: string | null | undefined) {
  return mcpAccessFromAuthorization(authorizationHeader) !== null;
}

export function bearerToken(authorizationHeader: string | null | undefined) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec((authorizationHeader || "").trim());
  return match ? match[1] : "";
}

/**
 * Jeton d’environnement d’abord (connecteurs déjà branchés), puis clé nominative.
 * Une preview n’accepte ni les jetons de production ni les clés `tbk_`.
 * Révoquée, expirée ou membre désactivé : la recherche renvoie null.
 */
export async function resolveMcpAccess(
  authorizationHeader: string | null | undefined,
  lookup?: PersonalMcpLookup
): Promise<McpAccess | null> {
  const fromEnv = mcpAccessFromAuthorization(authorizationHeader);
  if (fromEnv) return fromEnv;
  if (isVercelPreview()) return null;
  const token = bearerToken(authorizationHeader);
  if (!token || !isPersonalApiKey(token)) return null;
  const find = lookup ?? (await import("./mcp-api-key-store")).findPersonalMcpAccess;
  const found = await find(token);
  return found ? Object.freeze(found) : null;
}

export async function resolveMcpAuthorized(authorizationHeader: string | null | undefined) {
  return (await resolveMcpAccess(authorizationHeader)) !== null;
}

/** Collègue porté par la clé du contexte. Null pour un jeton d’environnement. */
export function mcpActingStaff() {
  const staff = currentMcpAccess().staff;
  if (!staff?.id) return null;
  return staff;
}

export function runWithMcpAccess<T>(access: McpAccess, run: () => T): T {
  return accessStore.run(access, run);
}

export function currentMcpAccess(): McpAccess {
  return accessStore.getStore() ?? DENIED;
}
