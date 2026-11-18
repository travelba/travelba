import type { SupabaseClient } from "@supabase/supabase-js";
import { hasReviewMark, withoutReviewMark } from "@/lib/crm/review-doubt";

export type VerifiedCard = { id: string; titre: string; kind: string };

type ItemRow = {
  id: string;
  kind: string | null;
  title: string | null;
  details: Record<string, unknown> | null;
};

/**
 * Retire `needs_review` et `review_reason` sur les cartes demandées.
 * `carteIds` null : toutes les cartes marquées du dossier.
 * Ne change pas `visible_to_client` et n’envoie aucun message.
 */
export async function clearBookingCardReview(
  db: SupabaseClient,
  bookingId: string,
  carteIds: string[] | null
): Promise<{ cartes: VerifiedCard[] } | { error: string; status: number }> {
  const { data, error } = await db
    .from("crm_booking_items")
    .select("id, kind, title, details")
    .eq("booking_id", bookingId);
  if (error) return { error: "Cartes du dossier illisibles.", status: 400 };
  const rows = (data || []) as ItemRow[];
  if (carteIds) {
    const known = new Set(rows.map((row) => row.id));
    if (carteIds.some((id) => !known.has(id))) {
      return { error: "Carte introuvable sur ce dossier.", status: 404 };
    }
  }
  const targets = rows.filter((row) => {
    if (carteIds && !carteIds.includes(row.id)) return false;
    return hasReviewMark(row.details);
  });
  const cartes: VerifiedCard[] = [];
  for (const row of targets) {
    const { error: updateError } = await db
      .from("crm_booking_items")
      .update({ details: withoutReviewMark(row.details) })
      .eq("id", row.id)
      .eq("booking_id", bookingId);
    if (updateError) return { error: "La carte n’a pas pu être marquée vérifiée.", status: 400 };
    cartes.push({
      id: row.id,
      titre: (row.title || "").trim() || "Étape",
      kind: row.kind || "",
    });
  }
  return { cartes };
}
