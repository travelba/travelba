/** Preview Vercel : ne pas utiliser les secrets de production. */
export function isVercelPreview(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "preview";
}

/**
 * Seule exception : la clé service_role de la branche Supabase `staging`
 * (`lnygnjbvuzgarseqfjlm`), et seulement si l’URL publique vise cette même branche.
 * Une clé de production (`sb_secret_…` ou un JWT d’un autre projet) reste vide.
 */
export function stagingPreviewServiceRole(
  value: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
) {
  if (!isVercelPreview(env)) return "";
  const key = (value ?? "").trim();
  if (!key.startsWith("eyJ")) return "";
  let host = "";
  try {
    host = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "").host;
  } catch {
    return "";
  }
  if (host !== "lnygnjbvuzgarseqfjlm.supabase.co") return "";
  const claims = jwtPayload(key);
  if (claims.role !== "service_role" || claims.ref !== "lnygnjbvuzgarseqfjlm") return "";
  return key;
}

function jwtPayload(token: string): { role?: string; ref?: string } {
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { role?: unknown; ref?: unknown };
    return {
      role: typeof json.role === "string" ? json.role : undefined,
      ref: typeof json.ref === "string" ? json.ref : undefined,
    };
  } catch {
    return {};
  }
}

/** Chaîne vide sur une preview, même si la variable est encore présente. */
export function productionOnlySecret(
  value: string | undefined | null,
  env: Record<string, string | undefined> = process.env,
) {
  const staging = stagingPreviewServiceRole(value, env);
  if (staging) return staging;
  if (isVercelPreview(env)) return "";
  return (value ?? "").trim();
}
