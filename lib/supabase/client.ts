import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient(url, anonKey, { cookieOptions: AUTH_COOKIE_OPTIONS });
}
