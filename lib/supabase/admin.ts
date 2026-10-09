import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

/**
 * Service-role client — webhooks / jobs / bootstrap (bypass RLS).
 * Never import this into client components.
 * `allowPreview` : seulement la lecture MyLER. Les autres secrets de production
 * restent vides sur une preview (`productionOnlySecret`).
 */
export function createServiceClient(opts?: { allowPreview?: boolean }): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const key = opts?.allowPreview ? raw : productionOnlySecret(raw);
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
