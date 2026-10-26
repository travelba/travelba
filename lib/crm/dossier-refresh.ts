import "server-only";

import { syncBookingTitleFromSteps } from "@/lib/crm/bookings";
import { syncEstaForBookingId } from "@/lib/crm/esta-run";
import { companionNames } from "@/lib/crm/hotel-desk";
import { ensureHotelRequests, syncHotelDeskThreads, syncHotelMessages } from "@/lib/crm/hotel-desk-run";
import { principalGuest } from "@/lib/crm/hotel-arrival";
import { syncStayCards } from "@/lib/crm/hotel-arrival-run";
import { pliantCardForBooking, showPliantLast4 } from "@/lib/crm/pliant-card-run";
import { ensureTripShareCode } from "@/lib/crm/trip-share-code";
import { syncUkEtaForBookingId } from "@/lib/crm/uk-eta-run";
import type { CrmBookingItem, CrmBookingTraveler, CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Ce que l’ouverture du dossier faisait en écrivant : titre, cartes hôtel / Pliant,
 * courriers, ESTA, ETA, lien de partage. Déclenché par une écriture, pas par le GET.
 */
export async function refreshBookingDerived(bookingId: string, options?: { signatory?: string }) {
  const admin = createServiceClient();
  try {
    await syncBookingTitleFromSteps(admin, bookingId);
  } catch (error) {
    console.info("[dossier] titre", error instanceof Error ? error.message : "ignoré");
  }

  const { data: booking, error } = await admin
    .from("crm_bookings")
    .select("id, status, end_date, currency, reference, customer_id, visible_to_client")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) return;

  const [{ data: items }, { data: travelers }, holderQuery] = await Promise.all([
    admin.from("crm_booking_items").select("*").eq("booking_id", bookingId),
    admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
    booking.customer_id
      ? admin.from("crm_customers").select("first_name, last_name").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bookingItems = (items || []) as CrmBookingItem[];
  const bookingTravelers = (travelers || []) as CrmBookingTraveler[];
  const holder = (holderQuery.data || null) as Pick<CrmCustomer, "first_name" | "last_name"> | null;

  try {
    await syncStayCards(admin, {
      bookingId,
      bookingStatus: booking.status,
      bookingEndDate: booking.end_date || null,
      currency: booking.currency,
      items: bookingItems,
      travelers: bookingTravelers,
      holder,
    });
  } catch (stepError) {
    console.info("[dossier] cartes", stepError instanceof Error ? stepError.message : "ignoré");
  }

  const guest = principalGuest({
    travelers: bookingTravelers,
    holder: holder ? { first_name: holder.first_name || "", last_name: holder.last_name || "" } : null,
  });
  const guestName = `${guest.firstName} ${guest.lastName}`.trim();
  try {
    await ensureHotelRequests(admin, {
      bookingId,
      reference: booking.reference,
      currency: booking.currency,
      guest: guestName,
      companions: companionNames(bookingTravelers, guestName),
      signatory: options?.signatory,
      items: bookingItems,
    });
    await syncHotelMessages(admin, bookingId);
    await syncHotelDeskThreads(admin, bookingId);
  } catch (stepError) {
    console.info("[dossier] hôtel", stepError instanceof Error ? stepError.message : "ignoré");
  }

  try {
    const [{ data: cardRows }, { data: arrivalRows }, registry] = await Promise.all([
      admin
        .from("crm_booking_cards")
        .select("pliant_card_id, last4, booking_id")
        .eq("booking_id", bookingId),
      admin.from("crm_hotel_arrivals").select("pliant_card_id, card_last4").eq("booking_id", bookingId),
      pliantCardForBooking(admin, bookingId),
    ]);
    await showPliantLast4(admin, {
      bookingCards: (cardRows || []) as { pliant_card_id: string; last4?: string | null; booking_id?: string | null }[],
      arrivals: (arrivalRows || []) as { pliant_card_id: string | null; card_last4: string | null }[],
      registry,
    });
  } catch (stepError) {
    console.info("[dossier] pliant", stepError instanceof Error ? stepError.message : "ignoré");
  }

  try {
    await syncEstaForBookingId(admin, bookingId);
  } catch (stepError) {
    console.info("[dossier] esta", stepError instanceof Error ? stepError.message : "ignoré");
  }
  try {
    await syncUkEtaForBookingId(admin, bookingId);
  } catch (stepError) {
    console.info("[dossier] uk-eta", stepError instanceof Error ? stepError.message : "ignoré");
  }
  if (booking.visible_to_client) {
    try {
      await ensureTripShareCode(admin, bookingId);
    } catch (stepError) {
      console.info("[dossier] partage", stepError instanceof Error ? stepError.message : "ignoré");
    }
  }
}
