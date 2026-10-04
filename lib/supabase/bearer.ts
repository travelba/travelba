import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "@/lib/supabase/env";

export function createAnonAuthClient(): SupabaseClient {
  const { url, anonKey } = publicSupabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client RLS avec le JWT du titulaire — pas le service role. */
export function createBearerClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = publicSupabaseEnv();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
