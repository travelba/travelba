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
  /** `mcp` : jeton général. Sinon le nom déclaré dans TRAVELBA_MCP_PASSPORT_TOKENS. */
  actor: string;
  passport: boolean;
};

const accessStore = new AsyncLocalStorage<McpAccess>();
const DENIED: McpAccess = Object.freeze({ actor: "mcp", passport: false });
let warnedSharedSecret = false;

function passportGrants(): { actor: string; secret: string }[] {
  const raw = productionOnlySecret(process.env.TRAVELBA_MCP_PASSPORT_TOKENS);
  if (!raw) return [];
  const general = mcpSecret();
  const grants: { actor: string; secret: string }[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const split = entry.indexOf(":");
    if (split <= 0) continue;
    const actor = entry.slice(0, split).trim().toLowerCase();
    const secret = entry.slice(split + 1).trim();
    if (actor === "mcp" || !ACTOR.test(actor) || secret.length < MIN_PASSPORT_SECRET) continue;
    if (general && secretEquals(secret, general)) {
      if (!warnedSharedSecret) {
        warnedSharedSecret = true;
        console.error("[mcp] passeport jeton ignoré : identique au jeton général");
      }
      continue;
    }
    grants.push({ actor, secret });
  }
  return grants;
}

/** Jeton général : CRM sans passeport. Jeton nommé : CRM et passeports. */
export function mcpAccessFromAuthorization(authorizationHeader: string | null | undefined): McpAccess | null {
  for (const grant of passportGrants()) {
    if (cronAuthorized(authorizationHeader, grant.secret)) {
      return Object.freeze({ actor: grant.actor, passport: true });
    }
  }
  if (cronAuthorized(authorizationHeader, mcpSecret())) {
    return Object.freeze({ actor: "mcp", passport: false });
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
