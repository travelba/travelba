import { cityCoverPhoto } from "@/lib/crm/cover-catalog";
import { catalogCoverUrl, coverDisplayUrl, placeKey } from "@/lib/crm/covers";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { SEARCH_PERK_LABEL } from "@/lib/crm/hotel-journey";
import { safeHotelPhoto } from "@/lib/crm/hotel-search";

/**
 * Photo de repli déjà dans le dépôt, quand le lieu n’a pas d’image de catalogue.
 * Les photos d’hôtel viennent des séjours déjà enregistrés, jamais d’une adresse inventée.
 */
export const HOTEL_SEARCH_HERO_FALLBACK = "/whatsapp/hotel.jpg";

/** Puces sous la carte. Une seule liste, à modifier ici. */
export const HOTEL_SEARCH_CITY_CHIPS = ["Paris", "Milan", "Courchevel", "Bordeaux"] as const;

const HOME_ADVANTAGE_KEYS = ["breakfast", "upgrade", "earlyCheckIn", "lateCheckOut"] as const;

/**
 * Pastilles de la recherche, dans le même ordre que la carte.
 * Elles ne remplacent pas les avantages lus d’un hôtel.
 */
export const TRAVEL_BA_SEARCH_ADVANTAGES = HOME_ADVANTAGE_KEYS.map(
  (key) => SEARCH_PERK_LABEL.find((row) => row.key === key)?.label || ""
).filter((label) => label.length > 0);

/** Première page : la carte membre, avant de chercher. */
export const HOTEL_ACCESS_EYEBROW = "Club Travel BA";

export const HOTEL_CLUB_TITLE = "Ma carte";

export const HOTEL_CLUB_LEVEL = "Mon niveau";

export const HOTEL_CLUB_CARD = "Carte de fidélité";

export const HOTEL_CLUB_GIVEN = "Prénom";

export const HOTEL_CLUB_FAMILY = "Nom";

export const HOTEL_CLUB_NUMBER = "N° d’adhérent";

export const HOTEL_CLUB_OPEN = "Ouvrir les hôtels";

/** Huit chiffres stables, tirés de la fiche. Le même client garde le même numéro. */
export function hotelMemberNumber(customerId: string) {
  let hash = 2166136261;
  for (const char of customerId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const body = String(hash >>> 0).padStart(8, "0").slice(-8);
  return `${body.slice(0, 4)} ${body.slice(4)}`;
}

export const HOTEL_CLUB_EVENT = "travelba-hotel-club";

export function openHotelClub() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HOTEL_CLUB_EVENT));
}

export const HOTEL_ACCESS_LEVEL_LABEL = "Niveau";

export const HOTEL_ACCESS_LEVEL = "Platinum";

/** Parcours affiché sur la carte. Le niveau en cours est HOTEL_ACCESS_LEVEL. */
export const HOTEL_CLUB_LADDER = ["Silver", "Gold", "Platinum", "Titanium"] as const;

export const HOTEL_CLUB_LADDER_LABEL = "Parcours";

export type HotelClubLadderName = (typeof HOTEL_CLUB_LADDER)[number];

export const HOTEL_CLUB_YOURS = "Votre niveau";

export const HOTEL_CLUB_NEXT = "Niveau suivant";

const CLUB_EARLY = "Arrivée anticipée et départ tardif*";
const CLUB_BREAKFAST = "Petit-déjeuner offert";
const CLUB_PRIORITY = "Surclassement prioritaire*";
const CLUB_CREDIT = "Jusqu’à 200 $ de crédit de dépense dans l’hôtel*";
const CLUB_TRANSFER = "Transfert aéroport*";

/** Prix d’adhésion et avantages, du plus simple au plus haut. Une seule liste. */
export const HOTEL_CLUB_TIERS = [
  {
    name: "Silver",
    price: "300 € par an",
    lines: ["Jusqu’à −10 % sur le catalogue", CLUB_EARLY],
  },
  {
    name: "Gold",
    price: "700 € par an",
    lines: ["Jusqu’à −15 % sur le catalogue", CLUB_EARLY, "Surclassement si disponible*"],
  },
  {
    name: "Platinum",
    price: "1 200 € par an",
    lines: ["Jusqu’à −20 % sur le catalogue", CLUB_BREAKFAST, CLUB_EARLY, CLUB_PRIORITY, CLUB_CREDIT, CLUB_TRANSFER],
  },
  {
    name: "Titanium",
    price: "1 600 € par an",
    lines: [
      "Jusqu’à −25 % sur le catalogue",
      CLUB_BREAKFAST,
      CLUB_EARLY,
      CLUB_PRIORITY,
      CLUB_CREDIT,
      CLUB_TRANSFER,
      "Conciergerie de luxe, tables et activités",
      "Accueil VIP à l’aéroport",
      "Pré-enregistrement à l’hôtel",
      "Réservation pour un non-adhérent",
    ],
  },
] as const satisfies readonly { name: HotelClubLadderName; price: string; lines: readonly string[] }[];

export function hotelClubLadderState(name: HotelClubLadderName) {
  const current = HOTEL_CLUB_LADDER.indexOf(HOTEL_ACCESS_LEVEL);
  const index = HOTEL_CLUB_LADDER.indexOf(name);
  if (index < current) return "done" as const;
  if (index === current) return "now" as const;
  return "next" as const;
}

export const HOTEL_ACCESS_OFFER = "Offert*";

export const HOTEL_ACCESS_UNTIL = "Jusqu’au 31 déc. 2026";

export const HOTEL_ACCESS_PROMISE =
  "Un catalogue d’hôtels aux tarifs qui vous sont réservés, avec des avantages que l’on ne trouve pas en réservation directe.";

/** Avantages du niveau en cours. L’astérisque renvoie à HOTEL_ACCESS_RESERVE. Le petit-déjeuner n’en a pas. */
export const HOTEL_ACCESS_LINES = HOTEL_CLUB_TIERS.find((tier) => tier.name === HOTEL_ACCESS_LEVEL)!.lines;

export const HOTEL_ACCESS_RESERVE = "* Soumis à disponibilité et selon l’hôtel.";

export type FeaturedHotel = {
  name: string;
  city: string;
  photo: string;
  hotelId: number | null;
};

export function hotelLocalScope(customerId: string) {
  return customerId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

export function hotelRecentStorageKey(customerId: string) {
  const id = hotelLocalScope(customerId);
  return id ? `hotel-recent-list:${id}` : "hotel-recent-list";
}

export function hotelDraftStorageKey(customerId: string) {
  const id = hotelLocalScope(customerId);
  return id ? `hotel-search-last:${id}` : "hotel-search-last";
}

/** Photo du lieu choisi, sinon l’image d’hôtel déjà hébergée dans le projet. */
export function hotelSearchHeroSrc(place: string) {
  const raw = place.replace(/\s+/g, " ").trim();
  const candidates = [raw, raw.split(",")[0] || "", raw.split(" ")[0] || ""];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = placeKey(candidate);
    if (!key || key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    const photo = cityCoverPhoto(key);
    if (photo) return coverDisplayUrl(catalogCoverUrl(photo), 960);
  }
  return HOTEL_SEARCH_HERO_FALLBACK;
}

/** Hôtels les plus réservés, avec une photo réelle. Sans photo, la ligne est ignorée. */
export function rankFeaturedHotels(
  rows: { name: string; city: string; photo: string; hotelId?: number | null }[],
  limit = 8
): FeaturedHotel[] {
  const counts = new Map<string, FeaturedHotel & { n: number }>();
  for (const row of rows) {
    const name = row.name.replace(/\s+/g, " ").trim().slice(0, 80);
    const photo = safeHotelPhoto(row.photo);
    if (name.length < 2 || !photo) continue;
    const key = foldHotelLabel(name).replace(/\bmilano\b/g, "milan");
    const city = row.city.replace(/\s+/g, " ").trim().slice(0, 80);
    const hotelId = typeof row.hotelId === "number" && Number.isInteger(row.hotelId) && row.hotelId > 0 ? row.hotelId : null;
    const current = counts.get(key);
    if (!current) {
      counts.set(key, { name, city, photo, hotelId, n: 1 });
      continue;
    }
    current.n += 1;
    if (!current.city && city) current.city = city;
    if (!current.hotelId && hotelId) current.hotelId = hotelId;
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "fr"))
    .slice(0, Math.max(0, limit))
    .map(({ name, city, photo, hotelId }) => ({ name, city, photo, hotelId }));
}
