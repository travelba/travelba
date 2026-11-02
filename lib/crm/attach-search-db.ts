import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACH_CANDIDATE_LIMIT, attachSearchTokens } from "./attach-search";

/**
 * Identifiants des dossiers qui contiennent chaque mot (nom, société, référence, voyageurs).
 * `null` : la fonction n’est pas joignable (pas encore appliquée, ou erreur). L’appelant garde l’ancienne recherche.
 */
export async function findAttachBookingIds(admin: SupabaseClient, query: string, limit = ATTACH_CANDIDATE_LIMIT) {
  const q = query.trim().slice(0, 80);
  if (!attachSearchTokens(q).length) return [];
  const { data, error } = await admin.rpc("crm_attach_booking_search", { q, lim: limit });
  if (error) return null;
  const rows = Array.isArray(data) ? data : [];
  const ids: string[] = [];
  for (const row of rows) {
    const id = typeof row === "string" ? row : row && typeof row === "object" && "id" in row ? String(row.id || "") : "";
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
