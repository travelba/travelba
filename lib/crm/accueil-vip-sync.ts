import type { SupabaseClient } from "@supabase/supabase-js";
import { accueilVipSnapshotsDiffer, withLiveAccueilVip } from "./accueil-vip";
import type { CrmBookingItem } from "./types";

/** Réécrit l’aéroport et l’heure des accueils VIP à partir des vols du dossier. */
export async function resyncAccueilVip(supabase: SupabaseClient, bookingId: string) {
  const { data, error } = await supabase.from("crm_booking_items").select("*").eq("booking_id", bookingId);
  if (error) throw error;
  const rows = (data || []) as CrmBookingItem[];
  if (!rows.some((row) => row.kind === "accueil_vip")) return;
  const live = withLiveAccueilVip(rows);
  for (const next of live) {
    if (next.kind !== "accueil_vip") continue;
    const current = rows.find((row) => row.id === next.id);
    if (!current || !accueilVipSnapshotsDiffer(current, next)) continue;
    const { error: updateError } = await supabase
      .from("crm_booking_items")
      .update({
        title: next.title,
        start_at: next.start_at,
        end_at: next.end_at,
        details: next.details,
      })
      .eq("id", next.id)
      .eq("booking_id", bookingId);
    if (updateError) throw updateError;
  }
}
