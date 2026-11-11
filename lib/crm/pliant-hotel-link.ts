import { hotelDisplayName } from "./carnet";
import { hotelsNamedInDesignation } from "./eta-il-fee";
import { hotelChannel } from "./hotel-arrival";
import { leHotelIdFromItem } from "./hotel-contact";
import { MANUAL_CARD_NOTE } from "./manual-stay-card";
import { isActiveItem, type CrmBookingItem } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type HotelCardLine = {
  id: string;
  name: string;
  active: boolean;
};

/**
 * L’hôtel auquel rattacher une carte fraîchement émise.
 * Un seul hôtel actif, l’identifiant indiqué, ou un nom qui n’en cite qu’un.
 * Plusieurs hôtels sans nom clair : rien, pour ne pas coller le débit au mauvais séjour.
 */
export function hotelLineForIssuedCard(input: {
  hotels: HotelCardLine[];
  designation?: string | null;
  itemId?: string | null;
}): string | null {
  const active = input.hotels.filter((hotel) => hotel.active && hotel.id);
  const asked = (input.itemId || "").trim();
  if (asked) {
    const named = active.find((hotel) => hotel.id === asked);
    return named ? named.id : null;
  }
  if (active.length === 1) return active[0].id;
  const cited = hotelsNamedInDesignation(
    active.map((hotel) => hotel.name),
    input.designation
  );
  if (!cited.cited) return null;
  const ids = [
    ...new Set(active.filter((hotel) => cited.hotels.includes(hotel.name)).map((hotel) => hotel.id)),
  ];
  return ids.length === 1 ? ids[0] : null;
}

function sourceFamily(item: Pick<CrmBookingItem, "details">) {
  const value = item.details?.source_family;
  return typeof value === "string" ? value : "";
}

/**
 * Pose la carte sur la ligne hôtel (`crm_hotel_arrivals.pliant_card_id`).
 * Une carte déjà là, ou un séjour clôturé, n’est pas remplacée.
 * Le plafond saisi reste : la note « Saisie agence » empêche le cron de le réécrire
 * quand la ligne n’avait pas déjà une note.
 * Aucun lien public `/k/` : ce n’est pas un envoi à l’hôtel.
 */
export async function linkIssuedCardToHotel(
  admin: Admin,
  input: {
    bookingId: string;
    cardId: string;
    last4: string | null;
    limitCents: number;
    currency: string;
    items: Pick<CrmBookingItem, "id" | "kind" | "title" | "supplier" | "details" | "lifecycle">[];
    designation?: string | null;
    itemId?: string | null;
  }
): Promise<string | null> {
  const cardId = input.cardId.trim();
  if (!cardId) return null;
  const hotels: HotelCardLine[] = input.items
    .filter((item) => item.kind === "hotel")
    .map((item) => ({
      id: item.id,
      name: hotelDisplayName(item as CrmBookingItem),
      active: isActiveItem(item),
    }));
  const itemId = hotelLineForIssuedCard({
    hotels,
    designation: input.designation,
    itemId: input.itemId,
  });
  if (!itemId) return null;
  const item = input.items.find((row) => row.id === itemId);
  if (!item) return null;

  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id, pliant_card_id, card_closed_at, task_note")
    .eq("booking_id", input.bookingId)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as {
    id: string;
    pliant_card_id: string | null;
    card_closed_at: string | null;
    task_note: string | null;
  } | null;
  if (row?.card_closed_at) return null;
  if (row?.pliant_card_id && row.pliant_card_id !== cardId) return null;
  if (row?.pliant_card_id === cardId) return itemId;

  const note = (row?.task_note || "").trim();
  const patch = {
    pliant_card_id: cardId,
    card_last4: input.last4,
    card_limit_cents: input.limitCents,
    currency: input.currency,
    ...(note ? {} : { task_note: MANUAL_CARD_NOTE, task_open: false }),
  };
  if (row?.id) {
    const { error } = await admin.from("crm_hotel_arrivals").update(patch).eq("id", row.id).is("pliant_card_id", null);
    if (error) throw new Error(error.message || "Le lien hôtel n’a pas été écrit.");
    return itemId;
  }

  const channel = hotelChannel({
    sourceFamily: sourceFamily(item),
    supplier: item.supplier,
    leHotelId: leHotelIdFromItem(item),
  });
  const { error } = await admin.from("crm_hotel_arrivals").insert({
    booking_id: input.bookingId,
    booking_item_id: itemId,
    channel,
    ...patch,
    task_note: MANUAL_CARD_NOTE,
    task_open: false,
  });
  if (error) throw new Error(error.message || "Le lien hôtel n’a pas été écrit.");
  return itemId;
}
