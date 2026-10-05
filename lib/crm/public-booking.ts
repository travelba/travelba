import type { CrmBooking } from "./types";

/**
 * Colonnes d’un dossier qu’un composant « use client » peut recevoir.
 * React sérialise l’objet entier dans le flux RSC : la ligne brute de
 * `crm_bookings` (notes_internal, total_amount, customer_id, billing_*,
 * agency_commission, include_in_ledger, client_settles_stay, archived_*…)
 * ne doit jamais partir vers le navigateur d’un client ou d’un visiteur.
 * Les montants affichés se calculent côté serveur et passent en prop dédiée.
 */
export const PUBLIC_BOOKING_KEYS = [
  "id",
  "reference",
  "title",
  "destination",
  "start_date",
  "end_date",
  "currency",
  "status",
  "cover_image_path",
  "cover_credit",
  "notes_client",
  "prices_visible",
  "visible_to_client",
  "offer_chauffeur",
  "offer_greeter",
  "offer_checkin",
  "offer_visa",
  "updated_at",
] as const;

export type PublicBookingKey = (typeof PUBLIC_BOOKING_KEYS)[number];

export type PublicBooking = Pick<CrmBooking, PublicBookingKey>;

/** Projection stricte : seules les clés listées, rien d’autre. */
export function toPublicBooking(booking: CrmBooking): PublicBooking {
  const out: Partial<Record<PublicBookingKey, unknown>> = {};
  for (const key of PUBLIC_BOOKING_KEYS) {
    if (key in booking) out[key] = booking[key];
  }
  return out as PublicBooking;
}
