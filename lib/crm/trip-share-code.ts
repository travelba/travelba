import type { SupabaseClient } from "@supabase/supabase-js";
import { isTripShareCode, tripShareCode } from "./trip-share";

/**
 * Crée le code de partage une fois, seulement pour un séjour déjà publié.
 * Sert au lien /v/CODE et à la couverture WhatsApp (/api/covers/sejour/REF?partage=CODE).
 */
export async function ensureTripShareCode(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin
    .from("crm_bookings")
    .select("share_code, visible_to_client, archived_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data?.visible_to_client || data.archived_at) return null;
  if (typeof data.share_code === "string" && isTripShareCode(data.share_code)) return data.share_code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = tripShareCode();
    const { data: updated, error } = await admin
      .from("crm_bookings")
      .update({ share_code: code })
      .eq("id", bookingId)
      .is("share_code", null)
      .select("share_code")
      .maybeSingle();
    if (updated?.share_code && isTripShareCode(updated.share_code)) return updated.share_code;
    if (error) continue;
    const { data: again } = await admin
      .from("crm_bookings")
      .select("share_code")
      .eq("id", bookingId)
      .maybeSingle();
    if (typeof again?.share_code === "string" && isTripShareCode(again.share_code)) return again.share_code;
  }
  return null;
}
