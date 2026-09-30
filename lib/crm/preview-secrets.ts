/** Preview Vercel : ne pas utiliser les secrets de production. */
export function isVercelPreview() {
  return process.env.VERCEL_ENV === "preview";
}

/**
 * Cloud Agent Cursor : secrets éventuellement injectés dans la VM.
 * Ne pas les consommer — retirer l’injection au dashboard, puis rotation.
 */
export function isCursorCloudAgent() {
  return Boolean(
    (process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES || "").trim() ||
      (process.env.CLOUD_AGENT_ALL_SECRET_NAMES || "").trim()
  );
}

/** Chaîne vide sur une preview ou un Cloud Agent, même si la variable est encore présente. */
export function productionOnlySecret(value: string | undefined | null) {
  if (isVercelPreview() || isCursorCloudAgent()) return "";
  return (value ?? "").trim();
}
