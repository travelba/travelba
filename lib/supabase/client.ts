import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

/** Espace agence. L’espace client ne s’en sert pas : son cookie est posé par le serveur. */
export function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient(url, anonKey, { cookieOptions: AUTH_COOKIE_OPTIONS });
}
