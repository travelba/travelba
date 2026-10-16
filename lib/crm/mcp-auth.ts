import { AsyncLocalStorage } from "node:async_hooks";
import { cronAuthorized } from "./cron-auth";
import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";

/** Jeton du MCP Grok Bot. Vide sur une preview, même si la variable est encore là. */
export function mcpSecret() {
  return productionOnlySecret(process.env.TRAVELBA_MCP_TOKEN);
}

const ACTOR = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const MIN_PASSPORT_SECRET = 16;

export type McpAccess = {
  /** `mcp` : jeton général. Sinon le nom du jeton nommé qui a authentifié l’appel. */
  actor: string;
  /** Jeton cité dans `TRAVELBA_MCP_PASSPORT_TOKENS`. */
  passport: boolean;
  /** Jeton cité dans `TRAVELBA_MCP_CARD_TOKENS`. Absent : pas de cartes. */
  cards?: boolean;
};

const accessStore = new AsyncLocalStorage<McpAccess>();
const DENIED: McpAccess = Object.freeze({ actor: "mcp", passport: false, cards: false });
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
 * Jeton général : CRM, sans passeport et sans carte.
 * Un jeton passeport ne lit pas les cartes. Un jeton carte ne lit pas les passeports.
 * Le même secret dans les deux variables ouvre les deux.
 */
export function mcpAccessFromAuthorization(authorizationHeader: string | null | undefined): McpAccess | null {
  const passport = matchingGrant(authorizationHeader, passportGrants());
  const cards = matchingGrant(authorizationHeader, cardGrants());
  if (passport || cards) {
    const actor =
      passport && cards ? (passport.actor === cards.actor ? passport.actor : cards.actor) : (cards ?? passport)!.actor;
    return Object.freeze({ actor, passport: Boolean(passport), cards: Boolean(cards) });
  }
  if (cronAuthorized(authorizationHeader, mcpSecret())) {
    return Object.freeze({ actor: "mcp", passport: false, cards: false });
  }
  return null;
}

export function mcpAuthorized(authorizationHeader: string | null | undefined) {
  return mcpAccessFromAuthorization(authorizationHeader) !== null;
}

export function runWithMcpAccess<T>(access: McpAccess, run: () => T): T {
  return accessStore.run(access, run);
}

export function currentMcpAccess(): McpAccess {
  return accessStore.getStore() ?? DENIED;
}
