import { foldHotelLabel } from "./hotel-catalog";
import { clientBenefits, HOTEL_PERK_WEIGHTS, type ClientHotel, type HotelPerks } from "./hotel-search";

export type HotelSort = "prix" | "avantages";

export type ClientRate = {
  offerId: string | null;
  room: string;
  title: string;
  detail: string;
  cancellation: string;
  benefits: string[];
  footnotes: string[];
  perks: HotelPerks;
  sellCents: number;
  perNightCents: number;
  currency: string;
  images: string[];
  /** Conditions de règlement, sans nom de fournisseur. */
  terms?: string;
  /** Limite d’annulation déjà en heure de Paris, si Little Emperors l’a donnée. */
  deadlineLabel?: string | null;
};

export type ClientRoom = {
  name: string;
  detail: string;
  images: string[];
  rates: ClientRate[];
  /** Surface intérieure, seulement si elle est connue. */
  area?: string;
  bed?: string;
  outlook?: string;
};

export type ClientHotelFile = {
  name: string;
  city: string;
  address: string;
  description: string;
  funFact: string;
  images: string[];
  amenities: string[];
  sections: { title: string; lines: string[] }[];
  benefits: string[];
  footnotes: string[];
  checkInTime: string;
  checkOutTime: string;
  coords: { lat: number; lng: number } | null;
  rooms: ClientRoom[];
};

const PERK_KEYS = Object.keys(HOTEL_PERK_WEIGHTS).filter((key) => key !== "other") as (keyof HotelPerks)[];

/** Même ordre que la pastille discrète de la carte de recherche, quand aucun avantage n’est lu. */
export const SEARCH_PERK_LABEL: { key: keyof HotelPerks; label: string }[] = [
  { key: "breakfast", label: "Petit-déjeuner" },
  { key: "freeCancellation", label: "Annulation gratuite" },
  { key: "upgrade", label: "Surclassement" },
  { key: "credit", label: "Crédit hôtel" },
  { key: "earlyCheckIn", label: "Arrivée anticipée" },
  { key: "lateCheckOut", label: "Départ tardif" },
];

export function discreetSearchPerk(perks: HotelPerks) {
  return SEARCH_PERK_LABEL.find((perk) => perks[perk.key])?.label || "";
}

/**
 * Les avantages de la carte de recherche, inchangés.
 * Le modèle générique ne les remplace pas. Sans ligne, le seul repli est la pastille que la recherche a montrée.
 */
export function stayBenefits(lines: string[], perks?: HotelPerks) {
  const shown = clientBenefits(lines);
  if (shown.length) return { lines: shown, discreet: "" };
  return { lines: shown, discreet: perks ? discreetSearchPerk(perks) : "" };
}

const BENEFIT_BREAKFAST = /petit-d[eé]jeuner|breakfast/i;
const BENEFIT_CANCEL = /annulation gratuite|non remboursable/i;

/** Badge du tarif. Une date mal lue ne transforme pas un tarif gratuit en « non remboursable ». */
export function rateCancelBadge(input: { free: boolean; deadlineLabel?: string | null; cancellation?: string | null }) {
  if (!input.free) return "Non remboursable";
  const until = (input.deadlineLabel || "").replace(/\s+/g, " ").trim();
  if (until) return `Annulation gratuite jusqu’au ${until}`;
  const phrase = (input.cancellation || "").replace(/\s+/g, " ").trim();
  if (/^gratuite jusqu/i.test(phrase)) return `Annulation ${phrase.charAt(0).toLocaleLowerCase("fr")}${phrase.slice(1)}`;
  if (/^annulation gratuite jusqu/i.test(phrase)) return phrase;
  return "Annulation gratuite";
}

/** Pastilles du tarif. Elles ne répètent pas un avantage déjà écrit, et ne le contredisent pas. */
export function rateChips(input: { breakfast: boolean; freeCancellation: boolean; benefits: string[] }) {
  const chips: string[] = [];
  if (input.freeCancellation && !input.benefits.some((line) => BENEFIT_CANCEL.test(line))) chips.push("Annulation gratuite");
  if (input.breakfast && !input.benefits.some((line) => BENEFIT_BREAKFAST.test(line))) chips.push("Petit-déjeuner inclus");
  return chips;
}

const BOARD_TOPIC = /petit-d[eé]jeuner|demi-pension|pension compl[eè]te|tout compris|chambre seule/i;

/** La pension du tarif, omise quand les avantages la disent déjà. */
export function rateBoardLine(board: string, benefits: string[]) {
  const line = board.replace(/\s+/g, " ").trim();
  if (!line || line === "Précisée à la confirmation") return "";
  if (BOARD_TOPIC.test(line) && benefits.some((benefit) => BOARD_TOPIC.test(benefit))) return "";
  return line;
}

export const BOOKING_STEPS = [
  { id: "room", label: "Chambre" },
  { id: "guests", label: "Voyageurs" },
  { id: "recap", label: "Récapitulatif" },
  { id: "pay", label: "Paiement" },
  { id: "confirm", label: "Confirmation" },
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number]["id"];

export type PayMethod = "card" | "agency";

/** Carte : on paie. Agence, ou essai sans encaissement : on valide la réservation. */
export function payActionLabel(input: { method: PayMethod | ""; trial: boolean }) {
  if (input.method === "agency" || input.trial) return "Valider la réservation";
  return "Valider et payer";
}

/**
 * L’agence n’avance pas un tarif hors euros quand la réservation part par l’API.
 * Hors API, les deux modes restent proposés, quelle que soit la devise.
 */
export function agencyPayOffered(input: { api: boolean; currency: string }) {
  if (!input.api) return true;
  return input.currency.toUpperCase() === "EUR";
}

/** Modes réellement proposés. La carte reste ouverte. L’agence suit la règle déjà appliquée à l’envoi. */
export function offeredPayMethods(input: { api: boolean; currency: string }): PayMethod[] {
  const methods: PayMethod[] = ["card"];
  if (agencyPayOffered(input)) methods.push("agency");
  return methods;
}

/**
 * Libellé et disponibilité du bouton bas.
 * Rien n’est envoyé tant qu’il est éteint : un mode doit être choisi, et la carte complète si son formulaire est ouvert.
 * « Réessayer » seulement après un échec. Sans mode, le libellé ne désigne ni la carte ni l’agence.
 */
export function payStepAction(input: {
  method: PayMethod | "";
  trial: boolean;
  failed: boolean;
  sending: boolean;
  cardOpen: boolean;
  cardComplete: boolean;
  offerReady: boolean;
  /** Faux tant que le client n’a pas coché un tarif non remboursable. Omis : rien à cocher. */
  nonRefundableAck?: boolean;
}) {
  const label = input.sending
    ? "Vérification…"
    : input.failed
      ? "Réessayer"
      : input.method
        ? payActionLabel({ method: input.method, trial: input.trial })
        : input.trial
          ? "Valider la réservation"
          : "Valider";
  const waitingForCard = input.method === "card" && input.cardOpen && !input.cardComplete;
  return {
    label,
    disabled: input.sending || !input.offerReady || !input.method || waitingForCard || input.nonRefundableAck === false,
  };
}

export function perkScore(hotel: Pick<ClientHotel, "perks" | "benefits">) {
  const flags = PERK_KEYS.reduce((sum, key) => sum + (hotel.perks[key] ? HOTEL_PERK_WEIGHTS[key] : 0), 0);
  return flags * 10 + hotel.benefits.length;
}

/** Une chambre regroupe ses tarifs réellement reçus, du moins cher au plus cher. Aucun tarif n’est inventé ni retiré. */
export function collapseRooms(rooms: ClientRoom[]): ClientRoom[] {
  const groups = new Map<string, ClientRoom>();
  for (const room of rooms) {
    const key = foldHotelLabel(room.name) || room.name.trim().toLocaleLowerCase("fr") || "sejour";
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...room, rates: room.rates.slice() });
      continue;
    }
    existing.rates.push(...room.rates);
    if (!existing.images.length) existing.images = room.images;
    if (!existing.area && room.area) existing.area = room.area;
    if (!existing.bed && room.bed) existing.bed = room.bed;
    if (!existing.outlook && room.outlook) existing.outlook = room.outlook;
  }
  const out: ClientRoom[] = [];
  for (const room of groups.values()) {
    const rates = room.rates.slice().sort((a, b) => a.sellCents - b.sellCents || a.title.localeCompare(b.title, "fr"));
    if (!rates.length) continue;
    out.push({ ...room, images: room.images.length ? room.images : rates[0].images, rates });
  }
  return out;
}

const JOURNEY_QUERY = {
  hotel: "",
  room: "chambre",
  guests: "voyageurs",
  recap: "recapitulatif",
  pay: "paiement",
  confirm: "confirmation",
} as const;

export type HotelJourneyStep = keyof typeof JOURNEY_QUERY;

export function hotelJourneyStep(value: string | null | undefined): HotelJourneyStep {
  if (value === "chambre") return "room";
  if (value === "voyageurs") return "guests";
  if (value === "recapitulatif") return "recap";
  if (value === "paiement") return "pay";
  if (value === "confirmation" || value === "demande") return "confirm";
  return "hotel";
}

export function hotelJourneySearch(hotel: string, step: HotelJourneyStep) {
  const params = new URLSearchParams();
  params.set("hotel", hotel);
  const etape = JOURNEY_QUERY[step];
  if (etape) params.set("etape", etape);
  return params.toString();
}

export function presentHotels(hotels: ClientHotel[], sort: HotelSort, needs: (keyof HotelPerks)[]) {
  const filtered = hotels.filter((hotel) => needs.every((key) => hotel.perks[key]));
  const copy = filtered.slice();
  if (sort === "avantages") {
    copy.sort((a, b) => perkScore(b) - perkScore(a) || a.sellCents - b.sellCents || a.name.localeCompare(b.name, "fr"));
  } else {
    copy.sort((a, b) => a.sellCents - b.sellCents || perkScore(b) - perkScore(a) || a.name.localeCompare(b.name, "fr"));
  }
  return copy;
}

export function guestNameOk(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < 3 || clean.length > 80) return false;
  const parts = clean.split(" ");
  if (parts.length < 2) return false;
  return parts.every((part) => part.length >= 1) && parts[parts.length - 1].length >= 2;
}

export function parseGuestNames(value: unknown, roomCount: number): string[] | null {
  if (!Array.isArray(value) || value.length !== roomCount) return null;
  const names = value.map((entry) => (typeof entry === "string" ? entry.replace(/\s+/g, " ").trim() : ""));
  if (names.some((name) => !guestNameOk(name))) return null;
  return names;
}
