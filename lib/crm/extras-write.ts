import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import {
  bookingHasFlight,
  checkinItemPayload,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraItemPayload,
  extraNoticeOk,
  extraTitle,
  findCheckinExtra,
  findExtra,
  findVisaExtra,
  isExtraKind,
  isExtraLeg,
  isServicePlace,
  itineraryOffers,
  visaItemPayload,
  type ExtraKind,
  type ExtraLeg,
  type ServicePlace,
} from "@/lib/crm/extras";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";

async function createCheckinExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    travelers: CrmBookingTraveler[];
  }
) {
  if (!bookingHasFlight(opts.items)) {
    throw new BookingIssuesError("Vol requis.", [
      {
        field: "items",
        message: "L’enregistrement se propose lorsqu’il y a un vol sur le dossier.",
      },
    ]);
  }
  if (findCheckinExtra(opts.items)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      { field: "kind", message: "L’enregistrement est déjà sur ce dossier." },
    ]);
  }
  await assertNotRefused(supabase, opts.booking.id, "checkin", null, null);
  const { data: existing } = await supabase
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", opts.booking.id);
  const maxSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const payload = checkinItemPayload({
    travelerCount: opts.travelers.length,
    visibleToClient: opts.booking.visible_to_client,
  });
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: opts.booking.id,
      sort_order: maxSort + 1,
      ...payload,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Enregistrement du service impossible. Réessayez." },
    ]);
  }
  await refreshBookingLedger(supabase, opts.booking.id);
  return {
    item: data as CrmBookingItem,
    heads: { adults: payload.details.passengers, children: 0, missingBirth: 0 },
    amount: payload.amount,
  };
}

async function createVisaExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    travelers: CrmBookingTraveler[];
  }
) {
  if (!bookingHasFlight(opts.items)) {
    throw new BookingIssuesError("Vol requis.", [
      {
        field: "items",
        message: "La demande de visa se propose lorsqu’il y a un vol sur le dossier.",
      },
    ]);
  }
  const trip = frenchPassportTrip(opts.items, opts.travelers.length);
  if (!trip.needsFormality) {
    throw new BookingIssuesError("Visa non requis.", [
      {
        field: "kind",
        message: "Aucune formalité de visa identifiée pour un passeport français sur ce séjour.",
      },
    ]);
  }
  if (findVisaExtra(opts.items)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      { field: "kind", message: "La demande de visa est déjà sur ce dossier." },
    ]);
  }
  await assertNotRefused(supabase, opts.booking.id, "visa", null, null);
  const { data: existing } = await supabase
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", opts.booking.id);
  const maxSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const payload = visaItemPayload({
    travelerCount: opts.travelers.length,
    visibleToClient: opts.booking.visible_to_client,
  });
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: opts.booking.id,
      sort_order: maxSort + 1,
      ...payload,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Enregistrement du service impossible. Réessayez." },
    ]);
  }
  await refreshBookingLedger(supabase, opts.booking.id);
  return {
    item: data as CrmBookingItem,
    heads: { adults: payload.details.passengers, children: 0, missingBirth: 0 },
    amount: payload.amount,
  };
}

export async function createBookingExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    travelers: CrmBookingTraveler[];
    holder: CrmCustomer;
    companions: CrmCompanion[];
    kind: ExtraKind | "visa" | "checkin";
    leg: ExtraLeg | null;
    place?: ServicePlace | null;
    address?: string | null;
    enforceWindow?: boolean;
    now?: Date;
  }
) {
  if (opts.kind === "visa") return createVisaExtra(supabase, opts);
  if (opts.kind === "checkin") return createCheckinExtra(supabase, opts);
  if (!opts.leg) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "leg", message: "Indiquez un trajet (départ ou arrivée)." },
    ]);
  }
  const leg = opts.leg;
  if (!bookingHasFlight(opts.items)) {
    throw new BookingIssuesError("Vol requis.", [
      {
        field: "items",
        message: "Chauffeur et greeter se proposent uniquement s’il y a un vol sur le dossier.",
      },
    ]);
  }
  const place = opts.kind === "chauffeur" ? opts.place || null : null;
  if (opts.kind === "chauffeur" && !place) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "place", message: "Indiquez un transfert domicile ou hôtel." },
    ]);
  }
  const offer = itineraryOffers(opts.items).find(
    (row) => row.kind === opts.kind && row.leg === leg && (row.place || null) === place
  );
  if (!offer) {
    throw new BookingIssuesError("Service indisponible.", [
      {
        field: "leg",
        message: "Ce service ne correspond pas aux vols du dossier.",
      },
    ]);
  }
  if (findExtra(opts.items, opts.kind, leg, place)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      {
        field: "leg",
        message: `${extraTitle(opts.kind, leg)} est déjà sur ce dossier.`,
      },
    ]);
  }
  await assertNotRefused(supabase, opts.booking.id, opts.kind, leg, place);
  const flightAt =
    extraFlightAt(opts.items, leg, opts.booking.start_date || opts.booking.end_date) || null;
  const startAt = offer.whenIso || flightAt;
  if (opts.enforceWindow && !extraNoticeOk(flightAt, opts.now)) {
    throw new BookingIssuesError("Délai de 48 h dépassé.", [
      {
        field: "leg",
        message:
          "Ce service se demande au moins 48 h avant le vol. Écrivez-nous sur WhatsApp pour un départ imminent.",
      },
    ]);
  }
  const at = startAt ? new Date(startAt) : opts.now || new Date();
  const heads = extraHeadsFromBooking({
    travelers: opts.travelers,
    holder: opts.holder,
    companions: opts.companions,
    at,
  });
  const amount = extraAmount(opts.kind, heads.adults, heads.children);
  if (amount <= 0) {
    throw new BookingIssuesError("Montant invalide.", [
      { field: "amount", message: "Impossible de calculer le tarif de ce service." },
    ]);
  }
  const { data: existing } = await supabase
    .from("crm_booking_items")
    .select("sort_order")
    .eq("booking_id", opts.booking.id);
  const maxSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
  const payload = extraItemPayload({
    kind: opts.kind,
    leg,
    place,
    startAt,
    amount,
    address: opts.address,
    adults: heads.adults,
    children: heads.children,
    visibleToClient: opts.booking.visible_to_client,
  });
  const { data, error } = await supabase
    .from("crm_booking_items")
    .insert({
      booking_id: opts.booking.id,
      sort_order: maxSort + 1,
      ...payload,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Enregistrement du service impossible. Réessayez." },
    ]);
  }
  await refreshBookingLedger(supabase, opts.booking.id);
  return { item: data as CrmBookingItem, heads, amount };
}

function refusalColumns(
  kind: ExtraKind | "visa" | "checkin",
  leg: ExtraLeg | null,
  place: ServicePlace | null | undefined
) {
  return {
    kind,
    service_leg: kind === "visa" || kind === "checkin" ? "" : leg || "",
    place: kind === "chauffeur" ? place || "" : "",
  };
}

async function assertNotRefused(
  supabase: SupabaseClient,
  bookingId: string,
  kind: ExtraKind | "visa" | "checkin",
  leg: ExtraLeg | null,
  place: ServicePlace | null | undefined
) {
  const columns = refusalColumns(kind, leg, place);
  const { data, error } = await supabase
    .from("crm_declined_services")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", columns.kind)
    .eq("service_leg", columns.service_leg)
    .eq("place", columns.place)
    .maybeSingle();
  if (error) {
    console.error("[crm] decline lookup:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Vérification du service impossible. Réessayez." },
    ]);
  }
  if (data) {
    throw new BookingIssuesError("Service refusé.", [
      { field: "kind", message: "Ce service a été refusé." },
    ]);
  }
}

export async function declineBookingService(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    kind: ExtraKind | "visa" | "checkin";
    leg: ExtraLeg | null;
    place?: ServicePlace | null;
  }
) {
  if (!bookingHasFlight(opts.items)) {
    throw new BookingIssuesError("Vol requis.", [
      { field: "items", message: "Ce service se propose lorsqu’il y a un vol sur le dossier." },
    ]);
  }
  if (opts.kind === "chauffeur" || opts.kind === "greeter") {
    if (!opts.leg) {
      throw new BookingIssuesError("Service invalide.", [
        { field: "leg", message: "Indiquez un trajet (départ ou arrivée)." },
      ]);
    }
    const place = opts.kind === "chauffeur" ? opts.place || null : null;
    if (opts.kind === "chauffeur" && !place) {
      throw new BookingIssuesError("Service invalide.", [
        { field: "place", message: "Indiquez un transfert domicile ou hôtel." },
      ]);
    }
    const offer = itineraryOffers(opts.items).find(
      (row) => row.kind === opts.kind && row.leg === opts.leg && (row.place || null) === place
    );
    if (!offer) {
      throw new BookingIssuesError("Service indisponible.", [
        { field: "leg", message: "Ce service ne correspond pas aux vols du dossier." },
      ]);
    }
    if (findExtra(opts.items, opts.kind, opts.leg, place)) {
      throw new BookingIssuesError("Service déjà demandé.", [
        { field: "leg", message: "Ce service est déjà validé." },
      ]);
    }
  } else if (opts.kind === "checkin" && findCheckinExtra(opts.items)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      { field: "kind", message: "L’enregistrement est déjà sur ce dossier." },
    ]);
  } else if (opts.kind === "visa" && findVisaExtra(opts.items)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      { field: "kind", message: "La demande de visa est déjà sur ce dossier." },
    ]);
  }

  const columns = refusalColumns(opts.kind, opts.leg, opts.place);
  const { error } = await supabase.from("crm_declined_services").upsert(
    {
      booking_id: opts.booking.id,
      kind: columns.kind,
      service_leg: columns.service_leg,
      place: columns.place,
    },
    { onConflict: "booking_id,kind,service_leg,place", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[crm] decline:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Le refus n’a pas pu être enregistré. Réessayez." },
    ]);
  }
  return { declined: true as const };
}

/** Retire un service déjà validé par le client, sans le marquer comme refusé. */
export async function cancelBookingExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    kind: ExtraKind | "visa" | "checkin";
    leg: ExtraLeg | null;
    place?: ServicePlace | null;
  }
) {
  const place = opts.kind === "chauffeur" ? opts.place || null : null;
  const item =
    opts.kind === "visa"
      ? findVisaExtra(opts.items)
      : opts.kind === "checkin"
        ? findCheckinExtra(opts.items)
        : opts.leg
          ? findExtra(opts.items, opts.kind, opts.leg, place)
          : null;
  if (!item || !("id" in item) || !item.id) {
    throw new BookingIssuesError("Service introuvable.", [
      { field: "kind", message: "Ce service n’est pas validé." },
    ]);
  }
  const { error } = await supabase
    .from("crm_booking_items")
    .delete()
    .eq("id", item.id)
    .eq("booking_id", opts.booking.id);
  if (error) {
    console.error("[crm] cancel extra:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Annulation impossible.", [
      { field: "form", message: "Le service n’a pas pu être annulé. Réessayez." },
    ]);
  }
  await refreshBookingLedger(supabase, opts.booking.id);
  return { cancelled: true as const };
}

export function parseExtraRequest(body: Record<string, unknown> | null) {
  const kind = String(body?.kind || "");
  if (kind === "visa") return { kind: "visa" as const, leg: null, place: null, address: null };
  if (kind === "checkin") return { kind: "checkin" as const, leg: null, place: null, address: null };
  const leg = String(body?.leg || "");
  const placeRaw = String(body?.place || "");
  const place = isServicePlace(placeRaw) ? placeRaw : null;
  if (!isExtraKind(kind) || !isExtraLeg(leg) || (kind === "chauffeur" && !place)) {
    throw new BookingIssuesError("Service invalide.", [
      {
        field: "kind",
        message: "Indiquez un service (transfert, greeter, enregistrement ou visa) et un trajet si besoin.",
      },
    ]);
  }
  return {
    kind,
    leg,
    place: kind === "chauffeur" ? place : null,
    address: String(body?.address || "").trim() || null,
  };
}
