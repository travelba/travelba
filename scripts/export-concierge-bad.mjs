/**
 * Exporte les réponses du Concierge notées « à revoir » comme cas d’éval.
 * Ne rien envoyer. Ne pas imprimer de numéro de passeport ni de MRZ.
 *
 *   npx tsx scripts/export-concierge-bad.mjs
 *
 * Lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (déjà dans l’environnement).
 */
import { createClient } from "@supabase/supabase-js";
import { badReplyCases } from "../lib/crm/concierge-feedback.ts";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from("crm_whatsapp_messages")
  .select("id, direction, body, created_at, concierge_mark, customer_id")
  .eq("concierge_mark", "bad")
  .order("created_at", { ascending: true })
  .limit(200);

if (error) {
  console.error(error.code || "lecture impossible");
  process.exit(1);
}

const ids = [...new Set((data || []).map((row) => row.customer_id).filter(Boolean))];
let inbound = [];
if (ids.length) {
  const earlier = await supabase
    .from("crm_whatsapp_messages")
    .select("id, direction, body, created_at, concierge_mark, customer_id")
    .in("customer_id", ids)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(400);
  if (earlier.error) {
    console.error(earlier.error.code || "lecture impossible");
    process.exit(1);
  }
  inbound = earlier.data || [];
}

const cases = badReplyCases([...(data || []), ...inbound]);
process.stdout.write(`${JSON.stringify(cases, null, 2)}\n`);
