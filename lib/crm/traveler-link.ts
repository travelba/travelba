import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { proposedTravelerLink } from "./person-name";
import type { CrmBookingTraveler, CrmCompanion } from "./types";

type CustomerName = { first_name: string | null; last_name: string | null };

/**
 * Relie un voyageur de billet au titulaire ou à un accompagnant quand les noms
 * correspondent, y compris « Benjamin » / « Benjamin, Elie, David ».
 * Le voyageur doit déjà appartenir à un dossier autorisé pour cet appel.
 */
export async function reconcileBookingTravelers(opts: {
  travelers: CrmBookingTraveler[];
  customer: CustomerName;
  companions: Pick<CrmCompanion, "id" | "first_name" | "last_name">[];
}): Promise<CrmBookingTraveler[]> {
  const updates: {
    id: string;
    booking_id: string;
    patch: { is_account_holder: true } | { companion_id: string };
  }[] = [];
  const linked = opts.travelers.map((traveler) => {
    const patch = proposedTravelerLink(traveler, opts.customer, opts.companions);
    if (!patch) return traveler;
    updates.push({ id: traveler.id, booking_id: traveler.booking_id, patch });
    return { ...traveler, ...patch };
  });
  if (!updates.length) return linked;
  try {
    const admin = createServiceClient();
    await Promise.all(
      updates.map((row) =>
        admin
          .from("crm_booking_travelers")
          .update(row.patch)
          .eq("id", row.id)
          .eq("booking_id", row.booking_id)
      )
    );
  } catch {
    // Le carnet affiche quand même le lien calculé pour cette requête.
  }
  return linked;
}
