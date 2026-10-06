import "server-only";

import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { itineraryOffers, type ExtraLeg, type ServicePlace } from "@/lib/crm/extras";
import { geocodeRolzoPlace } from "@/lib/crm/rolzo-place";
import {
  quoteAmountIn,
  rolzoAccount,
  rolzoCancelBooking,
  rolzoCreateBooking,
  rolzoPickUpDate,
  rolzoTransferRates,
  RolzoError,
  type RolzoVehicleQuote,
} from "@/lib/crm/rolzo";
import { toE164 } from "@/lib/crm/phone";

export type ChauffeurPassenger = {
  firstName: string;
  lastName: string;
  sex: string | null;
  phone: string | null;
  count: number;
  luggage: number;
};

export async function quoteChauffeurOffer(input: {
  items: Parameters<typeof itineraryOffers>[0];
  leg: ExtraLeg;
  place: ServicePlace;
  depart: string;
  arrive: string;
  currency: string;
}) {
  const depart = input.depart.trim();
  const arrive = input.arrive.trim();
  if (!depart || !arrive) {
    throw new BookingIssuesError("Adresse requise.", [
      { field: "address", message: "Indiquez l’adresse de départ et l’adresse d’arrivée." },
    ]);
  }
  const offer = itineraryOffers(input.items).find(
    (row) => row.kind === "chauffeur" && row.leg === input.leg && row.place === input.place
  );
  if (!offer) {
    throw new BookingIssuesError("Service indisponible.", [
      { field: "leg", message: "Ce transfert ne correspond pas aux vols du dossier." },
    ]);
  }
  return listChauffeurQuotes({
    depart,
    arrive,
    pickUpIso: offer.whenIso,
    currency: input.currency,
  });
}

const MONTHLY_BILLING =
  "Rolzo facture encore à la carte. La réservation chauffeur partira quand la facturation mensuelle sera active.";

export async function listChauffeurQuotes(input: {
  depart: string;
  arrive: string;
  pickUpIso: string | null;
  currency: string;
}) {
  const pickUpDate = rolzoPickUpDate(input.pickUpIso);
  if (!pickUpDate) {
    throw new BookingIssuesError("Horaire manquant.", [
      { field: "leg", message: "L’heure de prise en charge manque pour ce transfert." },
    ]);
  }
  const [from, to] = await Promise.all([
    geocodeRolzoPlace(input.depart),
    geocodeRolzoPlace(input.arrive),
  ]);
  if (!from || !to) {
    throw new BookingIssuesError("Adresse introuvable.", [
      { field: "address", message: "Une adresse du transfert n’a pas été reconnue." },
    ]);
  }
  try {
    const quotes = await rolzoTransferRates({ from, to, pickUpDate });
    const vehicles = quotes.flatMap((quote) => {
      const amount = quoteAmountIn(quote, input.currency);
      if (amount == null) return [];
      return [{ ...quote, amount, currency: input.currency.trim().toUpperCase() || quote.currency }];
    });
    if (!vehicles.length) {
      throw new BookingIssuesError("Aucun véhicule.", [
        { field: "vehicle", message: "Aucun véhicule pour ce trajet." },
      ]);
    }
    return vehicles;
  } catch (error) {
    throw asIssues(error);
  }
}

export async function requoteChauffeurVehicle(input: {
  depart: string;
  arrive: string;
  pickUpIso: string | null;
  currency: string;
  vehicle: string;
}) {
  const vehicles = await listChauffeurQuotes(input);
  const match = vehicles.find((row) => row.label === input.vehicle);
  if (!match) {
    throw new BookingIssuesError("Véhicule indisponible.", [
      {
        field: "vehicle",
        message: "Ce véhicule n’est plus disponible pour ce trajet. Annulez la demande et choisissez à nouveau.",
      },
    ]);
  }
  return match;
}

export async function bookChauffeurWithRolzo(input: {
  depart: string;
  arrive: string;
  pickUpIso: string | null;
  currency: string;
  rateId: string;
  vehicle: string;
  reference: string;
  passenger: ChauffeurPassenger;
  flightNumber: string | null;
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
}) {
  let account: { booksWithoutCard: boolean };
  try {
    account = await rolzoAccount();
  } catch (error) {
    throw asIssues(error);
  }
  if (!account.booksWithoutCard) {
    throw new BookingIssuesError("Facturation Rolzo.", [{ field: "form", message: MONTHLY_BILLING }]);
  }
  const quotes = await listChauffeurQuotes(input);
  const quote =
    quotes.find((row) => row.rateId === input.rateId) || quotes.find((row) => row.label === input.vehicle);
  if (!quote) {
    throw new BookingIssuesError("Tarif expiré.", [
      { field: "vehicle", message: "Ce tarif a expiré. Choisissez à nouveau un véhicule." },
    ]);
  }
  const party = Math.max(1, Math.floor(input.passenger.count) || 1);
  if (quote.passengers > 0 && quote.passengers < party) {
    throw new BookingIssuesError("Véhicule trop petit.", [
      { field: "vehicle", message: "Ce véhicule est trop petit pour les voyageurs." },
    ]);
  }
  const phone = toE164(input.passenger.phone || "");
  const firstName = input.passenger.firstName.trim();
  const lastName = input.passenger.lastName.trim();
  if (!phone || !firstName || !lastName) {
    throw new BookingIssuesError("Passager incomplet.", [
      {
        field: "form",
        message: "Le nom et le téléphone du client manquent pour réserver le chauffeur.",
      },
    ]);
  }
  const flight = (input.flightNumber || "").replace(/\s+/g, "").toUpperCase();
  if ((input.pickupIsAirport || input.dropoffIsAirport) && !flight) {
    throw new BookingIssuesError("Vol manquant.", [
      { field: "leg", message: "Le numéro de vol manque pour réserver le transfert." },
    ]);
  }
  const body: Record<string, unknown> = {
    rateId: quote.rateId,
    client_notes: input.reference,
    services_location_notes: "",
    seatInfo: { babySeat: 0, childSeat: 0, boosterSeat: 0 },
    passengerInfo: {
      passenger: party,
      luggage: Math.max(party, Math.floor(input.passenger.luggage) || 0),
      phone,
      lastName,
      firstName,
      title: rolzoTitle(input.passenger.sex),
      fullName: `${firstName} ${lastName}`.trim(),
    },
  };
  if (input.pickupIsAirport) {
    body.airportPickUpInfo = {
      flightNumber: flight,
      flightType: "commercial",
      pickUpSign: lastName.slice(0, 40).toUpperCase(),
    };
  }
  if (input.dropoffIsAirport) {
    body.airportDropOffInfo = { flightNumber: flight, flightType: "commercial" };
  }
  try {
    const bookingId = await rolzoCreateBooking(body);
    return { bookingId, quote };
  } catch (error) {
    throw asIssues(error);
  }
}

export async function cancelChauffeurWithRolzo(bookingId: string) {
  try {
    await rolzoCancelBooking(bookingId);
  } catch (error) {
    if (error instanceof RolzoError && /déjà en cours/i.test(error.message)) return;
    throw asIssues(error);
  }
}

export function publicChauffeurQuote(quote: RolzoVehicleQuote) {
  return {
    rateId: quote.rateId,
    label: quote.label,
    amount: quote.amount,
    currency: quote.currency,
    passengers: quote.passengers,
    luggage: quote.luggage,
    cancellationHours: quote.cancellationHours,
    freeWaiting: quote.freeWaiting,
  };
}

function rolzoTitle(sex: string | null) {
  if (sex === "F") return "Mrs";
  if (sex === "X") return "Mx";
  return "Mr";
}

function asIssues(error: unknown): BookingIssuesError {
  if (error instanceof BookingIssuesError) return error;
  const message = error instanceof RolzoError ? error.message : "Rolzo n’a pas répondu. Réessayez.";
  return new BookingIssuesError("Rolzo.", [{ field: "form", message }]);
}
