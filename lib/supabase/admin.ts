import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — webhooks / jobs (bypass RLS).
 * Never import this into client components.
 */
export function createServiceClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquant (client service role requis pour l’agent WhatsApp)."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
