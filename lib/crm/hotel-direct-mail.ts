/**
 * Courrier hôtel, français puis anglais. Le nom du programme n’est ici que pour l’hôtel,
 * jamais dans l’écran client. Aucun numéro de carte.
 */

export const HOTEL_DIRECT_FROM = "reservations@travelba.fr";

export function outboundHotelRecipient(input: { live: boolean; hotelEmail: string | null; testInbox: string | null }) {
  const hotel = (input.hotelEmail || "").trim().toLowerCase();
  if (!hotel || !hotel.includes("@")) return { to: null as string | null, redirected: false, blocked: "contact" as const };
  if (!input.live) {
    const test = (input.testInbox || "").trim().toLowerCase();
    if (!test.includes("@")) return { to: null, redirected: true, blocked: "test_inbox" as const };
    return { to: test, redirected: true, blocked: null };
  }
  return { to: hotel, redirected: false, blocked: null };
}

export function hotelRequestLetter(input: {
  guestNames: string[];
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  room: string;
  rate: string;
  benefits: string[];
  arrival: string | null;
  sellLabel: string;
  reference: string;
  partnerRate: boolean;
  kind: "request" | "chase" | "cancel" | "refund";
}) {
  const guests = input.guestNames.filter(Boolean).join(", ") || "Le voyageur";
  const benefits = input.benefits.length ? input.benefits.join(" · ") : "—";
  const arrival = input.arrival || "à confirmer";
  const programme = input.partnerRate
    ? "Le voyageur est membre Little Emperors. Merci de confirmer ce tarif et ces avantages, ou de nous indiquer le tarif que vous pouvez honorer, avant tout débit.\nThe guest is a Little Emperors member. Please confirm this rate and these benefits, or tell us the rate you can honour, before any charge.\n"
    : "";
  const ask = {
    request: "Nous vous prions de bien vouloir confirmer la réservation et de nous adresser un lien de paiement.\nKindly confirm the reservation and send us a payment link.",
    chase: "Nous nous permettons de relancer notre demande, restée sans réponse.\nWe are following up on our request, which is still awaiting your reply.",
    cancel: "Nous vous prions d’annuler cette réservation.\nPlease cancel this reservation.",
    refund: "Nous vous prions d’annuler la réservation et de rembourser le montant sur la carte qui a réglé le lien.\nPlease cancel the reservation and refund the amount to the card that paid the link.",
  }[input.kind];
  const subjectCore = `${input.hotelName} · ${input.checkIn} · ${input.reference}`;
  const prefix = input.kind === "chase" ? "Relance — " : input.kind === "cancel" || input.kind === "refund" ? "Annulation — " : "";
  const text = [
    "Bonjour,",
    "",
    "Travel Business Agency souhaite réserver, pour son client :",
    `Voyageurs : ${guests}`,
    `Hôtel : ${input.hotelName}${input.city ? `, ${input.city}` : ""}`,
    `Dates : ${input.checkIn} → ${input.checkOut}`,
    `Chambre : ${input.room || "—"}`,
    `Tarif : ${input.rate || "—"} · ${input.sellLabel}`,
    `Avantages : ${benefits}`,
    `Heure d’arrivée : ${arrival}`,
    "",
    programme.trim(),
    ask,
    "",
    "Hello,",
    "",
    "Travel Business Agency would like to book for its guest:",
    `Guests: ${guests}`,
    `Hotel: ${input.hotelName}${input.city ? `, ${input.city}` : ""}`,
    `Dates: ${input.checkIn} → ${input.checkOut}`,
    `Room: ${input.room || "—"}`,
    `Rate: ${input.rate || "—"} · ${input.sellLabel}`,
    `Benefits: ${benefits}`,
    `Arrival time: ${arrival}`,
    "",
    "Nous vous remercions.",
    "Thank you.",
    "",
    "Travel Business Agency",
    input.reference,
  ]
    .filter((line) => line !== "")
    .join("\n");
  return { subject: `${prefix}${subjectCore}`.slice(0, 180), text };
}

export function clientConfirmationDraft(input: { firstName: string; hotel: string; confirmation: string; dates: string }) {
  const name = input.firstName.trim() || "Bonjour";
  return `Bonjour ${name},\n\nVotre séjour à ${input.hotel} est confirmé.\nNuméro de confirmation : ${input.confirmation}.\n${input.dates}\n\nVotre conseiller reste à votre disposition.\n\nTravel Business Agency`;
}
