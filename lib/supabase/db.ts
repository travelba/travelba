import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Surface minimale d’un client Supabase : `from()` seulement.
 * Service role ou session, au choix de l’appelant ; remplace les shims
 * `{ from: (table: string) => any }` recopiés dans lib/crm.
 */
export type Db = Pick<SupabaseClient, "from">;
