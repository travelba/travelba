/**
 * Clés publiques Supabase. Les références littérales à `process.env.NEXT_PUBLIC_*`
 * sont nécessaires pour l’inlining côté navigateur.
 */
export function publicSupabaseEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) {
    throw new Error(
      "Configuration Supabase manquante : définir NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, anonKey };
}
