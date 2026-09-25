import { productionOnlySecret } from "./preview-secrets";

export function cronSecret() {
  return productionOnlySecret(process.env.CRON_SECRET);
}

export function cronAuthorized(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined
) {
  const expected = secret?.trim();
  if (!expected) return false;
  return (authorizationHeader || "") === `Bearer ${expected}`;
}
