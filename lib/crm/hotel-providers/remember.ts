import "server-only";

import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { createServiceClient } from "@/lib/supabase/admin";
import type { FoldedRates } from "./aggregate";

type Link = FoldedRates["links"][number];

async function upsertLink(
  db: ReturnType<typeof createServiceClient>,
  canonicalId: string,
  provider: "little_emperors" | "expedia",
  providerHotelId: string,
  providerName: string,
  link: Link
) {
  const { data: existingLink } = await db
    .from("crm_hotel_supplier_links")
    .select("id, status")
    .eq("provider", provider)
    .eq("provider_hotel_id", providerHotelId)
    .maybeSingle();
  const status = (existingLink as { status?: string } | null)?.status;
  if (status === "rejected") return;
  const next = link.decision.status === "confirmed" ? "confirmed" : "proposed";
  if (existingLink && (existingLink as { id?: string }).id) {
    if (status === "confirmed" && next !== "confirmed") return;
    await db
      .from("crm_hotel_supplier_links")
      .update({
        canonical_id: canonicalId,
        confidence: link.decision.confidence,
        method: link.decision.method,
        status: next,
        provider_name: providerName.slice(0, 160),
      })
      .eq("id", (existingLink as { id: string }).id);
    return;
  }
  await db.from("crm_hotel_supplier_links").insert({
    canonical_id: canonicalId,
    provider,
    provider_hotel_id: providerHotelId,
    provider_name: providerName.slice(0, 160),
    confidence: link.decision.confidence,
    method: link.decision.method,
    status: next,
  });
}

/** Écrit les correspondances confirmées ou à vérifier. Une ligne rejetée n’est pas réécrite. */
export async function rememberHotelMatches(links: Link[]) {
  if (!links.length) return;
  try {
    const db = createServiceClient();
    for (const link of links) {
      const nameKey = foldHotelLabel(link.canonicalName);
      const cityKey = foldHotelLabel(link.canonicalCity);
      if (!nameKey || !link.expediaHotelId) continue;
      const { data: canonical } = await db
        .from("crm_hotels_canonical")
        .upsert(
          {
            name: link.canonicalName.slice(0, 160),
            name_key: nameKey,
            city: (link.canonicalCity || "").slice(0, 80),
            city_key: cityKey,
            latitude: link.lat,
            longitude: link.lng,
          },
          { onConflict: "name_key,city_key" }
        )
        .select("id")
        .single();
      const canonicalId = (canonical as { id?: string } | null)?.id;
      if (!canonicalId) continue;
      await upsertLink(db, canonicalId, "expedia", link.expediaHotelId, link.expediaName, link);
      if (link.leHotelId && link.leName) {
        await upsertLink(db, canonicalId, "little_emperors", link.leHotelId, link.leName, link);
      }
    }
  } catch {
    // La table peut ne pas être jouée. La recherche continue.
  }
}
