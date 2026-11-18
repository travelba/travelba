import { after } from "next/server";

/**
 * Après la réponse HTTP. Hors requête, ou pendant les tests, on ne bloque pas la création.
 */
export function scheduleHotelWebEnrichment(itemId: string) {
  if (!itemId || process.env.NODE_ENV === "test") return;
  try {
    after(async () => {
      try {
        const { enrichHotelItem } = await import("@/lib/crm/hotel-web-run");
        await enrichHotelItem(itemId);
      } catch (error) {
        console.warn("[hotel-web]", error instanceof Error ? error.message : "echec");
      }
    });
  } catch {
    // La carte est déjà créée. La recherche se relance avec le bouton.
  }
}
