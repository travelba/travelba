import type { JwtPayload, User } from "@supabase/supabase-js";

type ClaimsAuth = {
  getClaims: () => Promise<{
    data: { claims?: JwtPayload | null } | null;
    error: { message?: string } | null;
  }>;
};

/** Client Supabase (cookies ou navigateur) capable de vérifier le JWT localement. */
export type ClaimsClient = { auth: ClaimsAuth };

/**
 * Utilisateur déduit des claims du JWT, après vérification de la signature.
 * `getClaims` interroge le serveur Auth seulement si la clé est symétrique ou si le
 * jeton est près d’expirer. Les champs qui ne sont pas dans le JWT (identités, date
 * de création) restent vides : le callback Google continue d’appeler `getUser`.
 */
export function userFromClaims(claims: JwtPayload | null | undefined): User | null {
  const id = claims?.sub;
  if (!id) return null;
  const aud = claims.aud;
  return {
    id,
    aud: typeof aud === "string" ? aud : Array.isArray(aud) ? aud[0] || "authenticated" : "authenticated",
    role: typeof claims.role === "string" ? claims.role : "authenticated",
    email: typeof claims.email === "string" ? claims.email : undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    is_anonymous: claims.is_anonymous === true,
    created_at: "",
  };
}

export async function readVerifiedUser(supabase: ClaimsClient): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;
    return userFromClaims(data.claims);
  } catch {
    return null;
  }
}
