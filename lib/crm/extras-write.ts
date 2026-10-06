import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "@/lib/crm/bookings";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import {
  bookChauffeurWithRolzo,
  cancelChauffeurWithRolzo,
  listChauffeurQuotes,
  requoteChauffeurVehicle,
} from "@/lib/crm/chauffeur-quote";
import { addressLooksLikeAirport } from "@/lib/crm/rolzo-place";
import {
  bookingHasFlight,
  checkinItemPayload,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraItemPayload,
  extraNoticeOk,
  checkinProposed,
  extraProposed,
  extraTitle,
  serviceCancelLocked,
  extraPlaceOf,
  findCheckinExtra,
  findExtra,
  findVisaExtra,
  isExtraKind,
  isExtraLeg,
  isGreeterMoment,
  isServicePlace,
  itineraryOffers,
  serviceFlightLegs,
  visaItemPayload,
  type ExtraKind,
  type ExtraLeg,
  type GreeterMoment,
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
  if (!checkinProposed(opts.booking)) {
    throw new BookingIssuesError("Service non proposé.", [
      {
        field: "items",
        message: "L’agence n’a pas activé l’enregistrement sur le dossier.",
      },
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
    moment?: GreeterMoment | null;
    address?: string | null;
    departAddress?: string | null;
    arriveAddress?: string | null;
    rateId?: string | null;
    vehicle?: string | null;
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
        message: "Chauffeur et VIP Airport se proposent uniquement s’il y a un vol sur le dossier.",
      },
    ]);
  }
  if (!extraProposed(opts.booking, opts.kind)) {
    throw new BookingIssuesError("Service non proposé.", [
      {
        field: "items",
        message: "L’agence n’a pas activé ce service sur le dossier.",
      },
    ]);
  }
  const place = opts.kind === "chauffeur" ? opts.place || null : null;
  if (opts.kind === "chauffeur" && !place) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "place", message: "Indiquez un transfert domicile ou hôtel." },
    ]);
  }
  const departAddress = (opts.departAddress || "").trim();
  const arriveAddress = (opts.arriveAddress || "").trim();
  if (opts.kind === "chauffeur" && (departAddress || arriveAddress) && (!departAddress || !arriveAddress)) {
    throw new BookingIssuesError("Adresse requise.", [
      { field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." },
    ]);
  }
  if (opts.kind === "chauffeur" && !departAddress && !arriveAddress && !(opts.address || "").trim()) {
    throw new BookingIssuesError("Adresse requise.", [
      { field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." },
    ]);
  }
  const moment = opts.kind === "greeter" ? opts.moment || "depart" : null;
  const offer = itineraryOffers(opts.items).find(
    (row) =>
      row.kind === opts.kind &&
      row.leg === leg &&
      (row.place || null) === place &&
      (row.moment || null) === moment
  );
  if (!offer) {
    throw new BookingIssuesError("Service indisponible.", [
      {
        field: "leg",
        message: "Ce service ne correspond pas aux vols du dossier.",
      },
    ]);
  }
  if (findExtra(opts.items, opts.kind, leg, place, moment)) {
    throw new BookingIssuesError("Service déjà demandé.", [
      {
        field: "leg",
        message: `${extraTitle(opts.kind, leg)} est déjà sur ce dossier.`,
      },
    ]);
  }
  await assertNotRefused(supabase, opts.booking.id, opts.kind, leg, place, moment);
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
  const party = heads.adults + heads.children;
  const depart = departAddress || (opts.address || "").trim();
  let rolzo =
    opts.kind === "chauffeur"
      ? await quotedChauffeur({
          depart,
          arrive: arriveAddress,
          pickUpIso: startAt,
          currency: opts.booking.currency || "EUR",
          rateId: opts.rateId,
          vehicle: opts.vehicle,
          party,
        })
      : null;
  let rolzoBookingId: string | null = null;
  if (rolzo && opts.enforceWindow === false) {
    const booked = await bookChauffeurWithRolzo(
      chauffeurBookInput({
        booking: opts.booking,
        items: opts.items,
        holder: opts.holder,
        leg,
        depart,
        arrive: arriveAddress,
        pickUpIso: startAt,
        rateId: rolzo.rateId,
        vehicle: rolzo.label,
        party,
        luggage: party,
      })
    );
    rolzo = booked.quote;
    rolzoBookingId = booked.bookingId;
  }
  const amount = rolzo ? rolzo.amount : extraAmount(opts.kind, heads.adults, heads.children);
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
    moment,
    startAt,
    amount,
    address: opts.address,
    departAddress,
    arriveAddress,
    adults: heads.adults,
    children: heads.children,
    visibleToClient: opts.booking.visible_to_client,
    agencyStatus: opts.enforceWindow === false ? "confirmed" : "pending",
    rolzo: rolzo
      ? {
          rateId: rolzo.rateId,
          vehicle: rolzo.label,
          passengers: party,
          luggage: party,
          cancellationHours: rolzo.cancellationHours,
          freeWaiting: rolzo.freeWaiting,
          commissionPercent: rolzo.commissionPercent,
        }
      : null,
    rolzoBookingId,
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
  place: ServicePlace | null | undefined,
  moment?: GreeterMoment | null
) {
  return {
    kind,
    service_leg: kind === "visa" || kind === "checkin" ? "" : leg || "",
    place: kind === "chauffeur" ? place || "" : "",
    moment: kind === "greeter" ? moment || "depart" : "",
  };
}

export async function clearServiceRefusal(
  supabase: SupabaseClient,
  bookingId: string,
  kind: ExtraKind | "visa" | "checkin",
  leg: ExtraLeg | null,
  place: ServicePlace | null | undefined,
  moment?: GreeterMoment | null
) {
  const columns = refusalColumns(kind, leg, place, moment);
  const { error } = await supabase
    .from("crm_declined_services")
    .delete()
    .eq("booking_id", bookingId)
    .eq("kind", columns.kind)
    .eq("service_leg", columns.service_leg)
    .eq("place", columns.place)
    .eq("moment", columns.moment);
  if (error) {
    console.error("[crm] clear decline:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Service non enregistré.", [
      { field: "form", message: "Le service n’a pas pu être repris. Réessayez." },
    ]);
  }
}

async function assertNotRefused(
  supabase: SupabaseClient,
  bookingId: string,
  kind: ExtraKind | "visa" | "checkin",
  leg: ExtraLeg | null,
  place: ServicePlace | null | undefined,
  moment?: GreeterMoment | null
) {
  const columns = refusalColumns(kind, leg, place, moment);
  const { data, error } = await supabase
    .from("crm_declined_services")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", columns.kind)
    .eq("service_leg", columns.service_leg)
    .eq("place", columns.place)
    .eq("moment", columns.moment)
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
    moment?: GreeterMoment | null;
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
    const moment = opts.kind === "greeter" ? opts.moment || "depart" : null;
    if (opts.kind === "chauffeur" && !place) {
      throw new BookingIssuesError("Service invalide.", [
        { field: "place", message: "Indiquez un transfert domicile ou hôtel." },
      ]);
    }
    const offer = itineraryOffers(opts.items).find(
      (row) =>
        row.kind === opts.kind &&
        row.leg === opts.leg &&
        (row.place || null) === place &&
        (row.moment || null) === moment
    );
    if (!offer) {
      throw new BookingIssuesError("Service indisponible.", [
        { field: "leg", message: "Ce service ne correspond pas aux vols du dossier." },
      ]);
    }
    if (findExtra(opts.items, opts.kind, opts.leg, place, moment)) {
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

  const columns = refusalColumns(opts.kind, opts.leg, opts.place, opts.moment);
  const { error } = await supabase.from("crm_declined_services").upsert(
    {
      booking_id: opts.booking.id,
      kind: columns.kind,
      service_leg: columns.service_leg,
      place: columns.place,
      moment: columns.moment,
    },
    { onConflict: "booking_id,kind,service_leg,place,moment", ignoreDuplicates: true }
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
    moment?: GreeterMoment | null;
  }
) {
  const place = opts.kind === "chauffeur" ? opts.place || null : null;
  const moment = opts.kind === "greeter" ? opts.moment || "depart" : null;
  const item =
    opts.kind === "visa"
      ? findVisaExtra(opts.items)
      : opts.kind === "checkin"
        ? findCheckinExtra(opts.items)
        : opts.leg
          ? findExtra(opts.items, opts.kind, opts.leg, place, moment)
          : null;
  if (!item || !("id" in item) || !item.id) {
    throw new BookingIssuesError("Service introuvable.", [
      { field: "kind", message: "Ce service n’est pas validé." },
    ]);
  }
  if (serviceCancelLocked(opts.kind, item)) {
    throw new BookingIssuesError("Service confirmé.", [
      { field: "kind", message: "Ce service est confirmé par l’agence et ne peut plus être annulé." },
    ]);
  }
  const rolzoId = textDetail(item.details, "rolzo_booking_id");
  if (opts.kind === "chauffeur" && rolzoId) await cancelChauffeurWithRolzo(rolzoId);
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

/** L’agence confirme une demande client de chauffeur ou de greeter. */
export async function confirmBookingExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    kind: ExtraKind;
    leg: ExtraLeg | null;
    place?: ServicePlace | null;
    moment?: GreeterMoment | null;
    holder?: Pick<CrmCustomer, "first_name" | "last_name" | "phone" | "whatsapp" | "sex"> | null;
  }
) {
  if (!opts.leg) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "leg", message: "Indiquez un trajet (départ ou arrivée)." },
    ]);
  }
  const place = opts.kind === "chauffeur" ? opts.place || null : null;
  const moment = opts.kind === "greeter" ? opts.moment || "depart" : null;
  const item = findExtra(opts.items, opts.kind, opts.leg, place, moment) as CrmBookingItem | null;
  if (!item?.id) {
    throw new BookingIssuesError("Service introuvable.", [
      { field: "kind", message: "Ce service n’est pas en attente." },
    ]);
  }
  let details: Record<string, unknown> = { ...(item.details || {}), agency_status: "confirmed" };
  let amount = item.amount;
  if (opts.kind === "chauffeur" && textDetail(item.details, "rolzo_rate_id") && !textDetail(item.details, "rolzo_booking_id")) {
    if (!opts.holder) {
      throw new BookingIssuesError("Passager incomplet.", [
        { field: "form", message: "Le client manque pour réserver le chauffeur." },
      ]);
    }
    const depart = textDetail(item.details, "depart_address");
    const arrive = textDetail(item.details, "arrive_address");
    const party = Number(item.details?.rolzo_passengers) || 1;
    const booked = await bookChauffeurWithRolzo(
      chauffeurBookInput({
        booking: opts.booking,
        items: opts.items,
        holder: opts.holder,
        leg: opts.leg,
        depart,
        arrive,
        pickUpIso: item.start_at,
        rateId: textDetail(item.details, "rolzo_rate_id"),
        vehicle: textDetail(item.details, "rolzo_vehicle"),
        party,
        luggage: Number(item.details?.rolzo_luggage) || party,
      })
    );
    amount = booked.quote.amount;
    details = {
      ...details,
      rolzo_rate_id: booked.quote.rateId,
      rolzo_vehicle: booked.quote.label,
      rolzo_cancel_hours: booked.quote.cancellationHours,
      rolzo_free_waiting: booked.quote.freeWaiting,
      rolzo_commission_percent: booked.quote.commissionPercent,
      rolzo_booking_id: booked.bookingId,
    };
  }
  const confirmationRef =
    typeof details.rolzo_booking_id === "string" && details.rolzo_booking_id
      ? details.rolzo_booking_id
      : item.confirmation_ref;
  const { error } = await supabase
    .from("crm_booking_items")
    .update({ details, amount, confirmation_ref: confirmationRef })
    .eq("id", item.id)
    .eq("booking_id", opts.booking.id);
  if (error) {
    console.error("[crm] confirm extra:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Confirmation impossible.", [
      { field: "form", message: "Le service n’a pas pu être confirmé. Réessayez." },
    ]);
  }
  if (amount !== item.amount) await refreshBookingLedger(supabase, opts.booking.id);
  return { confirmed: true as const };
}

/** Le client corrige le départ et l’arrivée tant que l’agence n’a pas confirmé. */
export async function updateTransferAddresses(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
    leg: ExtraLeg | null;
    place?: ServicePlace | null;
    departAddress: string;
    arriveAddress: string;
  }
) {
  if (!opts.leg) {
    throw new BookingIssuesError("Service invalide.", [
      { field: "leg", message: "Indiquez un trajet (départ ou arrivée)." },
    ]);
  }
  const place = opts.place || null;
  const item = findExtra(opts.items, "chauffeur", opts.leg, place, null) as CrmBookingItem | null;
  if (!item?.id) {
    throw new BookingIssuesError("Service introuvable.", [
      { field: "kind", message: "Ce transfert n’est pas validé." },
    ]);
  }
  if (serviceCancelLocked("chauffeur", item)) {
    throw new BookingIssuesError("Service confirmé.", [
      { field: "kind", message: "Ce transfert est confirmé. L’adresse ne se modifie plus ici." },
    ]);
  }
  const depart = opts.departAddress.trim();
  const arrive = opts.arriveAddress.trim();
  if (!depart || !arrive) {
    throw new BookingIssuesError("Adresse requise.", [
      { field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." },
    ]);
  }
  const dropAtHome = (extraPlaceOf(item) || place) === "home" && opts.leg === "arrival";
  const vehicle = textDetail(item.details, "rolzo_vehicle");
  const requoted = vehicle
    ? await requoteChauffeurVehicle({
        depart,
        arrive,
        pickUpIso: item.start_at,
        currency: opts.booking.currency || "EUR",
        vehicle,
      })
    : null;
  const details = {
    ...(item.details || {}),
    depart_address: depart,
    arrive_address: arrive,
    pickup: dropAtHome ? arrive : depart,
    ...(requoted
      ? {
          rolzo_rate_id: requoted.rateId,
          rolzo_vehicle: requoted.label,
          rolzo_cancel_hours: requoted.cancellationHours,
          rolzo_free_waiting: requoted.freeWaiting,
          rolzo_commission_percent: requoted.commissionPercent,
        }
      : {}),
  };
  const { error } = await supabase
    .from("crm_booking_items")
    .update({ details, ...(requoted ? { amount: requoted.amount } : {}) })
    .eq("id", item.id)
    .eq("booking_id", opts.booking.id);
  if (error) {
    console.error("[crm] transfer address:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Adresse non enregistrée.", [
      { field: "form", message: "L’adresse n’a pas pu être enregistrée. Réessayez." },
    ]);
  }
  if (requoted) await refreshBookingLedger(supabase, opts.booking.id);
  return { updated: true as const };
}

/** L’agence a déposé les cartes d’embarquement : l’enregistrement ne s’annule plus. */
export async function confirmCheckinExtra(
  supabase: SupabaseClient,
  opts: {
    booking: CrmBooking;
    items: CrmBookingItem[];
  }
) {
  const item = findCheckinExtra(opts.items) as CrmBookingItem | null;
  if (!item?.id) {
    throw new BookingIssuesError("Service introuvable.", [
      { field: "kind", message: "L’enregistrement n’est pas validé." },
    ]);
  }
  const details = { ...(item.details || {}), agency_status: "confirmed" };
  const { error } = await supabase
    .from("crm_booking_items")
    .update({ details })
    .eq("id", item.id)
    .eq("booking_id", opts.booking.id);
  if (error) {
    console.error("[crm] confirm checkin:", error.code ?? "?", error.message ?? "");
    throw new BookingIssuesError("Confirmation impossible.", [
      { field: "form", message: "L’enregistrement n’a pas pu être confirmé. Réessayez." },
    ]);
  }
  return { confirmed: true as const };
}

export function parseExtraRequest(body: Record<string, unknown> | null) {
  const kind = String(body?.kind || "");
  const depart = String(body?.depart || "").trim() || null;
  const arrive = String(body?.arrive || "").trim() || null;
  if (kind === "visa") {
    return { kind: "visa" as const, leg: null, place: null, moment: null, address: null, depart: null, arrive: null, rateId: null, vehicle: null };
  }
  if (kind === "checkin") {
    return { kind: "checkin" as const, leg: null, place: null, moment: null, address: null, depart: null, arrive: null, rateId: null, vehicle: null };
  }
  const leg = String(body?.leg || "");
  const placeRaw = String(body?.place || "");
  const place = isServicePlace(placeRaw) ? placeRaw : null;
  const moment = isGreeterMoment(String(body?.moment || "")) ? (String(body?.moment) as GreeterMoment) : null;
  if (!isExtraKind(kind) || !isExtraLeg(leg) || (kind === "chauffeur" && !place)) {
    throw new BookingIssuesError("Service invalide.", [
      {
        field: "kind",
        message: "Indiquez un service (transfert, VIP Airport, enregistrement ou visa) et un trajet si besoin.",
      },
    ]);
  }
  return {
    kind,
    leg,
    place: kind === "chauffeur" ? place : null,
    moment: kind === "greeter" ? moment || "depart" : null,
    address: String(body?.address || "").trim() || null,
    depart,
    arrive,
    rateId: typeof body?.rateId === "string" ? body.rateId.trim() || null : null,
    vehicle: typeof body?.vehicle === "string" ? body.vehicle.trim() || null : null,
  };
}

function textDetail(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function quotedChauffeur(input: {
  depart: string;
  arrive: string;
  pickUpIso: string | null;
  currency: string;
  rateId?: string | null;
  vehicle?: string | null;
  party: number;
}) {
  const rateId = (input.rateId || "").trim();
  const vehicle = (input.vehicle || "").trim();
  if (!rateId && !vehicle) {
    throw new BookingIssuesError("Véhicule requis.", [
      { field: "vehicle", message: "Choisissez un véhicule." },
    ]);
  }
  const quotes = await listChauffeurQuotes({
    depart: input.depart,
    arrive: input.arrive,
    pickUpIso: input.pickUpIso,
    currency: input.currency,
  });
  const quote = quotes.find((row) => row.rateId === rateId) || quotes.find((row) => row.label === vehicle);
  if (!quote) {
    throw new BookingIssuesError("Tarif expiré.", [
      { field: "vehicle", message: "Ce tarif a expiré. Choisissez à nouveau un véhicule." },
    ]);
  }
  if (quote.passengers > 0 && quote.passengers < input.party) {
    throw new BookingIssuesError("Véhicule trop petit.", [
      { field: "vehicle", message: "Ce véhicule est trop petit pour les voyageurs." },
    ]);
  }
  return quote;
}

function chauffeurBookInput(input: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  holder: Pick<CrmCustomer, "first_name" | "last_name" | "phone" | "whatsapp" | "sex">;
  leg: ExtraLeg;
  depart: string;
  arrive: string;
  pickUpIso: string | null;
  rateId: string;
  vehicle: string;
  party: number;
  luggage: number;
}) {
  const flight = serviceFlightLegs(input.items).find((row) => row.leg === input.leg)?.flightNumber || null;
  return {
    depart: input.depart,
    arrive: input.arrive,
    pickUpIso: input.pickUpIso,
    currency: input.booking.currency || "EUR",
    rateId: input.rateId,
    vehicle: input.vehicle,
    reference: input.booking.reference,
    passenger: {
      firstName: input.holder.first_name,
      lastName: input.holder.last_name,
      sex: input.holder.sex,
      phone: input.holder.phone || input.holder.whatsapp,
      count: input.party,
      luggage: input.luggage,
    },
    flightNumber: flight,
    pickupIsAirport: addressLooksLikeAirport(input.depart),
    dropoffIsAirport: addressLooksLikeAirport(input.arrive),
  };
}
