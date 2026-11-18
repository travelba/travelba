import "server-only";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

/** Vide en preview, et tant que la variable n’est pas posée. */
export function perplexityApiKey() {
  return productionOnlySecret(process.env.PERPLEXITY_API_KEY);
}

export function perplexityConfigured() {
  return Boolean(perplexityApiKey());
}
