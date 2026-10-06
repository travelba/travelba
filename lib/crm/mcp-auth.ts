import { cronAuthorized } from "./cron-auth";
import { productionOnlySecret } from "./preview-secrets";

/** Jeton du MCP Grok Bot. Vide sur une preview, même si la variable est encore là. */
export function mcpSecret() {
  return productionOnlySecret(process.env.TRAVELBA_MCP_TOKEN);
}

export function mcpAuthorized(authorizationHeader: string | null | undefined) {
  return cronAuthorized(authorizationHeader, mcpSecret());
}
