import { parsePhoneNumberFromString } from "libphonenumber-js";

export type CyrilLeg = "outbound" | "return";

export type CyrilAirport = "Orly" | "Beauvais" | "Roissy-CDG";

export type CyrilFlight = {
  id: string;
  leg: CyrilLeg;
  airline: string;
  iata: string;
  number: string;
  airport: CyrilAirport;
  /** Heure locale HH:MM, relevé agence, sans nouvelle vérification. */
  depart: string;
  arrive: string;
};

export const CYRIL_OUTBOUND_LABEL = "Jeudi 8 octobre 2026";
export const CYRIL_RETURN_LABEL = "Dimanche 11 octobre 2026";

export const CYRIL_OUTBOUND: CyrilFlight[] = [
  { id: "to-3016", leg: "outbound", airline: "Transavia", iata: "TO", number: "TO 3016", airport: "Orly", depart: "10:40", arrive: "12:05" },
  { id: "fr-3844", leg: "outbound", airline: "Ryanair", iata: "FR", number: "FR 3844", airport: "Beauvais", depart: "10:55", arrive: "12:15" },
  { id: "af-1076", leg: "outbound", airline: "Air France", iata: "AF", number: "AF 1076", airport: "Roissy-CDG", depart: "12:30", arrive: "13:55" },
  { id: "at-749", leg: "outbound", airline: "Royal Air Maroc", iata: "AT", number: "AT 749", airport: "Orly", depart: "13:00", arrive: "14:15" },
  { id: "at-639", leg: "outbound", airline: "Royal Air Maroc", iata: "AT", number: "AT 639", airport: "Roissy-CDG", depart: "13:35", arrive: "14:55" },
  { id: "u2-4665", leg: "outbound", airline: "easyJet", iata: "U2", number: "U2 4665", airport: "Roissy-CDG", depart: "15:15", arrive: "16:45" },
  { id: "af-1876", leg: "outbound", airline: "Air France", iata: "AF", number: "AF 1876", airport: "Roissy-CDG", depart: "15:30", arrive: "16:50" },
  { id: "to-3124", leg: "outbound", airline: "Transavia", iata: "TO", number: "TO 3124", airport: "Orly", depart: "18:45", arrive: "20:10" },
];

export const CYRIL_RETURN: CyrilFlight[] = [
  { id: "to-3015", leg: "return", airline: "Transavia", iata: "TO", number: "TO 3015", airport: "Orly", depart: "11:40", arrive: "16:55" },
  { id: "to-3019", leg: "return", airline: "Transavia", iata: "TO", number: "TO 3019", airport: "Orly", depart: "14:45", arrive: "20:00" },
  { id: "af-1077", leg: "return", airline: "Air France", iata: "AF", number: "AF 1077", airport: "Roissy-CDG", depart: "15:00", arrive: "20:20" },
  { id: "at-740", leg: "return", airline: "Royal Air Maroc", iata: "AT", number: "AT 740", airport: "Orly", depart: "15:25", arrive: "20:25" },
  { id: "at-640", leg: "return", airline: "Royal Air Maroc", iata: "AT", number: "AT 640", airport: "Orly", depart: "16:35", arrive: "21:35" },
  { id: "to-3017", leg: "return", airline: "Transavia", iata: "TO", number: "TO 3017", airport: "Orly", depart: "16:50", arrive: "22:05" },
  { id: "u2-4666", leg: "return", airline: "easyJet", iata: "U2", number: "U2 4666", airport: "Roissy-CDG", depart: "17:35", arrive: "22:55" },
  { id: "af-1877", leg: "return", airline: "Air France", iata: "AF", number: "AF 1877", airport: "Roissy-CDG", depart: "17:55", arrive: "23:20" },
];

export const CYRIL_DIETS = [
  { id: "tout", label: "De tout" },
  { id: "cachere", label: "Cachère" },
  { id: "vegetarien", label: "Végétarien" },
] as const;

export type CyrilDiet = (typeof CYRIL_DIETS)[number]["id"];

export function cyrilDietLabel(value: string | null | undefined) {
  return CYRIL_DIETS.find((diet) => diet.id === value)?.label || null;
}

export const CYRIL_SHEET_HEADERS = [
  "Envoyé le",
  "Nom",
  "Prénom",
  "Téléphone",
  "Accompagnateur",
  "Régime",
  "Régime accompagnateur",
  "Aller — compagnie",
  "Aller — vol",
  "Aller — aéroport",
  "Aller — départ",
  "Aller — arrivée",
  "Retour — compagnie",
  "Retour — vol",
  "Retour — aéroport",
  "Retour — départ",
  "Retour — arrivée",
] as const;

export type CyrilGuest = {
  lastName: string;
  firstName: string;
  phone: string;
  companion?: string;
  diet?: string;
  companionDiet?: string;
  outboundId: string;
  returnId: string;
};

export function cyrilFlights(leg: CyrilLeg) {
  return leg === "outbound" ? CYRIL_OUTBOUND : CYRIL_RETURN;
}

export function cyrilFlightTitle(leg: CyrilLeg) {
  return leg === "outbound" ? "Paris → Marrakech" : "Marrakech → Paris";
}

export function cyrilFlightClock(hhmm: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  return `${match[1]}h${match[2]}`;
}

export function cyrilAirportLabel(flight: CyrilFlight) {
  return flight.leg === "outbound" ? `Départ ${flight.airport}` : `Arrivée ${flight.airport}`;
}

function cleanText(value: string, max: number) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function e164(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw) || parsePhoneNumberFromString(raw, "FR");
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

function sentAtLabel(sentAt: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(sentAt);
}

function flightCells(flight: CyrilFlight) {
  return [
    flight.airline,
    flight.number,
    flight.airport,
    cyrilFlightClock(flight.depart),
    cyrilFlightClock(flight.arrive),
  ];
}

export function buildCyrilSheetRow(
  guest: CyrilGuest,
  sentAt = new Date()
): { ok: true; row: string[] } | { ok: false; error: string } {
  const lastName = cleanText(guest.lastName || "", 80);
  const firstName = cleanText(guest.firstName || "", 80);
  if (!lastName || !firstName) {
    return { ok: false, error: "Indiquez votre nom et votre prénom." };
  }
  const phone = e164(guest.phone || "");
  if (!phone) {
    return { ok: false, error: "Indiquez un numéro de téléphone valide." };
  }
  const outbound = CYRIL_OUTBOUND.find((flight) => flight.id === guest.outboundId);
  if (!outbound) return { ok: false, error: "Choisissez le vol aller." };
  const inbound = CYRIL_RETURN.find((flight) => flight.id === guest.returnId);
  if (!inbound) return { ok: false, error: "Choisissez le vol retour." };
  const companion = cleanText(guest.companion || "", 120);
  const diet = cyrilDietLabel(guest.diet);
  if (!diet) return { ok: false, error: "Indiquez ce que vous mangez." };
  let companionDiet = "";
  if (companion) {
    const label = cyrilDietLabel(guest.companionDiet);
    if (!label) return { ok: false, error: "Indiquez ce que mange l’accompagnateur." };
    companionDiet = label;
  }
  const row = [
    sentAtLabel(sentAt),
    lastName,
    firstName,
    phone,
    companion,
    diet,
    companionDiet,
    ...flightCells(outbound),
    ...flightCells(inbound),
  ];
  return { ok: true, row };
}
