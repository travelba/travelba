import { deleteTrips, MtripError } from "@/lib/mtrip/client";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function removePublishedMtripBeforeEdit(
  guide: Pick<AgencyMtripGuide, "status" | "mtrip_identifier">
) {
  if (guide.status !== "published" || !guide.mtrip_identifier) return false;
  try {
    await deleteTrips([guide.mtrip_identifier]);
  } catch (error) {
    if (error instanceof MtripError && error.status === 404) return true;
    throw new Error(
      "La publication mTrip existante n’a pas pu être retirée. La modification est annulée."
    );
  }
  return true;
}

export async function markGuidePublicationInvalidated(
  supabase: SupabaseClient,
  userId: string,
  guideId: string
) {
  const { error } = await supabase
    .from("agency_mtrip_guides")
    .update({
      status: "ready",
      payload: null,
      app_links: {},
      published_at: null,
      mtrip_trip_id: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guideId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(
      "La publication distante a été retirée, mais l’état CRM n’a pas pu être actualisé."
    );
  }
}
