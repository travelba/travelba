import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

/** Service role pour le cron, le webhook et le journal. Preview admise : les clés ETG de prod y sont refusées. */
export function ratehawkDb(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const key = productionOnlySecret(raw) || raw;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
