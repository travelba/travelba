import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichirHotelFromInput, runHotelEnrichment } from "@/lib/crm/hotel-enrich";
import { createServiceClient } from "@/lib/supabase/admin";

export type { HotelWebRunResult, HotelWebStatus } from "@/lib/crm/hotel-enrich";

/**
 * Complète une carte hôtel. N’écrit que `details` : la visibilité reste celle de la carte.
 * Sans clé et sans fiche, un avertissement, et la carte n’est pas modifiée par la recherche.
 */
export async function enrichHotelItem(
  itemId: string,
  opts?: {
    force?: boolean;
    admin?: SupabaseClient;
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
  }
) {
  const admin = opts?.admin || createServiceClient();
  return runHotelEnrichment(admin, itemId, opts);
}

export async function enrichirHotel(input: Record<string, unknown>, admin?: SupabaseClient) {
  const client = admin || createServiceClient();
  return enrichirHotelFromInput(client, input);
}
