import type { TrainClasse, TrainOffer, TrainTarif } from "./train-whatsapp";
import { quoteTotal } from "./train-whatsapp";

/** Statuts de la demande. Le CRM n’achète rien avant « choix ». */
export const TRAIN_STATUSES = [
  "nouvelle",
  "recherche",
  "propositions",
  "en_attente",
  "prix_a_reconfirmer",
  "choix",
  "commande",
  "annulee",
] as const;

export type TrainStatus = (typeof TRAIN_STATUSES)[number];

export const TRAIN_STATUS_LABEL: Record<TrainStatus, string> = {
  nouvelle: "Nouvelle",
  recherche: "Recherche en cours",
  propositions: "Propositions envoyées",
  en_attente: "En attente",
  prix_a_reconfirmer: "Prix à reconfirmer",
  choix: "Choix reçu",
  commande: "Commandé",
  annulee: "Annulé",
};

export const TRAIN_DEFAULT_OUTBOUND = "À partir de 8h";
export const TRAIN_DEFAULT_RETURN = "À partir de 16h";

/** Enfant pour la salle basse : moins de 12 ans le jour de l’aller. */
export const TRAIN_CHILD_AGE = 12;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isoDay(value: string | null | undefined) {
  const day = String(value || "").slice(0, 10);
  return DAY.test(day) ? day : "";
}

/**
 * Dates déduites de l’hôtel : arrivée = aller, départ = retour.
 * Horaires proposés : aller à partir de 8h, retour à partir de 16h.
 * Tout reste modifiable dans le formulaire.
 */
export function trainFormDefaults(input: {
  homeCity?: string | null;
  hotels: { city?: string | null; start?: string | null; end?: string | null }[];
}) {
  const starts = input.hotels.map((hotel) => isoDay(hotel.start)).filter(Boolean).sort();
  const ends = input.hotels.map((hotel) => isoDay(hotel.end)).filter(Boolean).sort();
  const cities = input.hotels.map((hotel) => (hotel.city || "").trim()).filter(Boolean);
  const depart = (input.homeCity || "").trim();
  const arrivee = cities.find((city) => city.toLowerCase() !== depart.toLowerCase()) || cities[0] || "";
  return {
    depart,
    arrivee,
    allerDate: starts[0] || "",
    retourDate: ends[ends.length - 1] || "",
    allerCreneau: TRAIN_DEFAULT_OUTBOUND,
    retourCreneau: TRAIN_DEFAULT_RETURN,
  };
}

export function ageOnDate(birth: string | null | undefined, on: string) {
  const start = isoDay(birth);
  const day = isoDay(on);
  if (!start || !day) return null;
  const [year, month, date] = start.split("-").map(Number);
  const [toYear, toMonth, toDate] = day.split("-").map(Number);
  let age = toYear - year;
  if (toMonth < month || (toMonth === month && toDate < date)) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

function groupPhrase(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "place isolée ou côté fenêtre";
  if (count === 2) return "côte à côte ou face à face";
  if (count === 3) return "deux côte à côte et un en face ou à côté";
  if (count === 4) return "carré, sinon quatre places alignées, sinon deux et deux l’une derrière l’autre";
  const squares = Math.floor(count / 4);
  const rest = count % 4;
  const parts = Array.from({ length: squares }, () => groupPhrase(4));
  if (rest) parts.push(groupPhrase(rest));
  return parts.join(" ; ");
}

/** Préférence de placement, calculée sur le nombre de voyageurs. Salle basse s’il y a un enfant. */
export function seatingPreference(input: { count: number; child: boolean }) {
  const count = Math.max(0, Math.round(input.count) || 0);
  if (!count) return "";
  const seat = groupPhrase(count);
  const sentence = seat.charAt(0).toUpperCase() + seat.slice(1) + ".";
  return input.child ? `${sentence} Avec enfant, salle basse prioritaire (TGV duplex).` : sentence;
}

export function partyHasChild(ages: Array<number | null>) {
  return ages.some((age) => age != null && age < TRAIN_CHILD_AGE);
}

export function chosenPrice(input: {
  aller: TrainOffer;
  retour?: TrainOffer | null;
  classe: TrainClasse;
  tarif: TrainTarif;
  voyageurs: number;
}) {
  return quoteTotal(input);
}
