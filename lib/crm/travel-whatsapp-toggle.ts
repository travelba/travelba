import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone";
import { isSpouseRelationship } from "./travel-whatsapp-audience";

type Admin = SupabaseClient;

export function spouseTravelToggleRefusal(input: {
  found: boolean;
  relationship: string | null;
  phone: string | null;
  columnReady: boolean;
}) {
  if (!input.columnReady) return "La case infos voyage n’est pas encore en place.";
  if (!input.found) return "Voyageur introuvable sur ce dossier.";
  if (!isSpouseRelationship(input.relationship)) return "La case est réservée au conjoint.";
  if (!toE164(input.phone || "", "FR")) return "Le conjoint n’a pas de téléphone WhatsApp.";
  return null;
}

/** Coche ou décoche les infos voyage d’un conjoint sur un dossier. Aucun message. */
export async function setSpouseTravelWhatsapp(
  admin: Admin,
  input: { travelerId: string; bookingId?: string | null; enabled: boolean; staffId: string | null }
): Promise<{ ok: true; actif: boolean; voyageur_id: string } | { ok: false; error: string }> {
  const traveler = await admin
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder")
    .eq("id", input.travelerId)
    .maybeSingle();
  if (traveler.error || !traveler.data) {
    return { ok: false, error: spouseTravelToggleRefusal({ found: false, relationship: null, phone: null, columnReady: true }) || "Voyageur introuvable." };
  }
  const row = traveler.data as {
    id: string;
    booking_id: string;
    companion_id: string | null;
    is_account_holder: boolean;
  };
  if (input.bookingId && input.bookingId !== row.booking_id) {
    return { ok: false, error: "Ce voyageur n’est pas sur ce dossier." };
  }
  if (row.is_account_holder || !row.companion_id) {
    return { ok: false, error: spouseTravelToggleRefusal({ found: true, relationship: null, phone: null, columnReady: true }) || "La case est réservée au conjoint." };
  }
  const companion = await admin
    .from("crm_travel_companions")
    .select("id, relationship, phone")
    .eq("id", row.companion_id)
    .maybeSingle();
  const person = companion.data as { relationship: string | null; phone: string | null } | null;
  const refusal = spouseTravelToggleRefusal({
    found: true,
    relationship: person?.relationship || null,
    phone: person?.phone || null,
    columnReady: true,
  });
  if (refusal) return { ok: false, error: refusal };
  const now = new Date().toISOString();
  const updated = await admin
    .from("crm_booking_travelers")
    .update({
      whatsapp_travel_updates: input.enabled,
      whatsapp_travel_updates_at: now,
      whatsapp_travel_updates_by: input.staffId,
    })
    .eq("id", row.id);
  if (updated.error) {
    const missing = updated.error.code === "42703" || updated.error.code === "PGRST204";
    return {
      ok: false,
      error: missing
        ? spouseTravelToggleRefusal({ found: true, relationship: person?.relationship || null, phone: person?.phone || null, columnReady: false }) ||
          "La case infos voyage n’est pas encore en place."
        : "La case n’a pas pu être enregistrée.",
    };
  }
  return { ok: true, actif: input.enabled, voyageur_id: row.id };
}
