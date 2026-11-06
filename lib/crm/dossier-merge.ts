import type { SupabaseClient } from "@supabase/supabase-js";
import { syncBookingTitleFromSteps } from "@/lib/crm/bookings";
import { itemMatchKey } from "@/lib/crm/item-match";
import { namesReferToSamePerson } from "@/lib/crm/person-match";

type ItemRow = {
  id: string;
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

type TravelerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * Réunit les cartes et les voyageurs du dossier en double sur le dossier gardé.
 * Un dossier déjà Visible le reste. Rien n’est envoyé au client.
 * Une carte bancaire sur le double bloque la réunion.
 */
export async function mergeDossierInto(admin: SupabaseClient, keepId: string, dropId: string) {
  if (!keepId || !dropId || keepId === dropId) return { ok: true as const, message: null };
  const { data: cards } = await admin.from("crm_booking_cards").select("id").eq("booking_id", dropId);
  if ((cards || []).length) {
    return {
      ok: false as const,
      message: "Deux dossiers correspondent, mais l’un a une carte bancaire. Ils n’ont pas été réunis.",
    };
  }
  const [{ data: keepItems }, { data: dropItems }, { data: keepTravelers }, { data: dropTravelers }] =
    await Promise.all([
      admin
        .from("crm_booking_items")
        .select("id, kind, title, confirmation_ref, start_at, end_at, details")
        .eq("booking_id", keepId),
      admin
        .from("crm_booking_items")
        .select("id, kind, title, confirmation_ref, start_at, end_at, details")
        .eq("booking_id", dropId),
      admin.from("crm_booking_travelers").select("id, first_name, last_name").eq("booking_id", keepId),
      admin.from("crm_booking_travelers").select("id, first_name, last_name").eq("booking_id", dropId),
    ]);
  const matchable = (item: ItemRow) => ({ ...item, kind: item.kind || "fee" });
  const keptKeys = new Set(
    ((keepItems || []) as ItemRow[])
      .map((item) => itemMatchKey(matchable(item)))
      .filter((key): key is string => Boolean(key))
  );
  for (const item of (dropItems || []) as ItemRow[]) {
    const key = itemMatchKey(matchable(item));
    if (key && keptKeys.has(key)) {
      await admin.from("crm_booking_items").delete().eq("id", item.id);
      continue;
    }
    const { error } = await admin.from("crm_booking_items").update({ booking_id: keepId }).eq("id", item.id);
    if (error) return { ok: false as const, message: "Les cartes n’ont pas pu être réunies." };
    if (key) keptKeys.add(key);
  }
  const travelers = (keepTravelers || []) as TravelerRow[];
  for (const traveler of (dropTravelers || []) as TravelerRow[]) {
    const same = travelers.some((row) =>
      namesReferToSamePerson(
        { first_name: row.first_name || "", last_name: row.last_name || "" },
        { first_name: traveler.first_name || "", last_name: traveler.last_name || "" }
      )
    );
    if (same) {
      await admin.from("crm_booking_travelers").delete().eq("id", traveler.id);
      continue;
    }
    const { error } = await admin.from("crm_booking_travelers").update({ booking_id: keepId }).eq("id", traveler.id);
    if (error) return { ok: false as const, message: "Les voyageurs n’ont pas pu être réunis." };
    travelers.push(traveler);
  }
  await admin.from("crm_booking_documents").update({ booking_id: keepId }).eq("booking_id", dropId);
  await admin.from("crm_le_bookings").update({ crm_booking_id: keepId, status: "linked" }).eq("crm_booking_id", dropId);
  await admin
    .from("crm_email_ingest")
    .update({ suggested_booking_id: keepId })
    .eq("suggested_booking_id", dropId);
  const { error } = await admin.from("crm_bookings").delete().eq("id", dropId);
  if (error) return { ok: false as const, message: "Le dossier en double n’a pas pu être retiré." };
  try {
    await syncBookingTitleFromSteps(admin, keepId);
  } catch {
    // Le titre sera repris au prochain enregistrement. Les cartes sont déjà réunies.
  }
  return { ok: true as const, message: null };
}
