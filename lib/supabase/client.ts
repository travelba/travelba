import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient(url, anonKey, { cookieOptions: AUTH_COOKIE_OPTIONS });
}

/**
 * Espace client. Le navigateur ne renouvelle pas la session : un cookie écrit par script
 * est plafonné à 7 jours par Safari. Le proxy réécrit le cookie HttpOnly à chaque visite.
 */
export function createAccountBrowserClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient(url, anonKey, {
    isSingleton: false,
    cookieOptions: AUTH_COOKIE_OPTIONS,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}
