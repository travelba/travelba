import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";

export function cronSecret() {
  return productionOnlySecret(process.env.CRON_SECRET);
}

export function cronAuthorized(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined
) {
  const expected = secret?.trim();
  if (!expected) return false;
  return secretEquals(authorizationHeader || "", `Bearer ${expected}`);
}
