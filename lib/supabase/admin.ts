import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

/**
 * Service-role client — webhooks / jobs / bootstrap (bypass RLS).
 * Never import this into client components.
 */
export function createServiceClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
