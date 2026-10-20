import { littleEmperorsProductionBlocked } from "@/lib/crm/little-emperors";
import type { HotelDirectoryEntry } from "@/lib/crm/hotel-catalog";
import { foldHotelLabel, hotelCitiesCompatible } from "@/lib/crm/hotel-catalog";

export type SearchMode = "off" | "mock" | "staging";

export type StayHit = {
  provider: "catalog" | "little-emperors" | "amadeus" | "mock" | "rolzo";
  kind: "hotel" | "flight" | "transfer";
  title: string;
  city: string;
  net: number | null;
  currency: string;
  commissionable: boolean;
  hotelCommission: number | null;
  /** simulation : ce n’est pas une disponibilité fournisseur. */
  simulated: boolean;
  note: string;
};

const CONTACT = /@|téléphone|telephone|\+\d{6,}/i;

export function conciergeSearchMode(env = process.env): SearchMode {
  const raw = (env.CONCIERGE_SEARCH || "").trim();
  if (raw === "mock" || raw === "staging" || raw === "off") return raw;
  return "off";
}

function clean(hit: StayHit): StayHit | null {
  if (CONTACT.test(`${hit.title} ${hit.note}`)) return null;
  return hit;
}

/** Noms du catalogue, sans prix et sans contact. */
export function searchCatalog(entries: HotelDirectoryEntry[], city: string): StayHit[] {
  const place = city.trim();
  if (!place) return [];
  return entries
    .filter((entry) => hotelCitiesCompatible(entry.city, place) || foldHotelLabel(entry.hotel_name).includes(foldHotelLabel(place)))
    .slice(0, 3)
    .map((entry) =>
      clean({
        provider: "catalog",
        kind: "hotel",
        title: entry.hotel_name,
        city: entry.city,
        net: null,
        currency: "EUR",
        commissionable: false,
        hotelCommission: null,
        simulated: false,
        note: "Catalogue interne. Pas de tarif, pas de contact.",
      })
    )
    .filter((hit): hit is StayHit => Boolean(hit));
}

const MOCK_HOTELS: Record<string, { title: string; net: number; commissionable: boolean; hotelCommission: number | null }[]> = {
  marrakech: [
    { title: "Riad simulé Médina", net: 900, commissionable: false, hotelCommission: null },
    { title: "Palais simulé Hivernage", net: 1400, commissionable: true, hotelCommission: 0.1 },
    { title: "Maison simulée Palmeraie", net: 1100, commissionable: true, hotelCommission: 0.08 },
  ],
};

function mockHotels(city: string): StayHit[] {
  const key = foldHotelLabel(city);
  const rows = MOCK_HOTELS[key] || [
    { title: `Adresse simulée ${city}`, net: 800, commissionable: false, hotelCommission: null },
    { title: `Maison simulée ${city}`, net: 1000, commissionable: true, hotelCommission: 0.1 },
  ];
  return rows.map((row) => ({
    provider: "mock" as const,
    kind: "hotel" as const,
    title: row.title,
    city,
    net: row.net,
    currency: "EUR",
    commissionable: row.commissionable,
    hotelCommission: row.hotelCommission,
    simulated: true,
    note: "Simulation. Ce n’est pas une disponibilité.",
  }));
}

function mockFlights(city: string): StayHit[] {
  return [
    {
      provider: "amadeus",
      kind: "flight",
      title: `Vol simulé vers ${city}`,
      city,
      net: null,
      currency: "EUR",
      commissionable: false,
      hotelCommission: null,
      simulated: true,
      note: "Amadeus dans le dépôt lit des billets. Il ne cherche pas un vol. Simulation sans prix.",
    },
  ];
}

export type SupplierSearch = {
  hotels: StayHit[];
  flights: StayHit[];
  transfers: StayHit[];
  mode: SearchMode;
  reason: string;
};

/**
 * RateHawk n’est pas dans le dépôt. Little Emperors et Rolzo ont un client de test,
 * jamais appelé ici sans une fonction fetch injectée, et jamais vers la production.
 */
export async function searchSuppliers(input: {
  city: string;
  mode?: SearchMode;
  catalog?: HotelDirectoryEntry[];
  fetchImpl?: typeof fetch;
}): Promise<SupplierSearch> {
  const mode = input.mode || conciergeSearchMode();
  const city = input.city.trim();
  const catalog = searchCatalog(input.catalog || [], city);
  if (mode === "off" || !city) {
    return { hotels: catalog, flights: [], transfers: [], mode, reason: mode === "off" ? "Recherche coupée." : "Ville manquante." };
  }
  if (mode === "staging") {
    if (littleEmperorsProductionBlocked()) {
      return { hotels: catalog, flights: [], transfers: [], mode, reason: "La production ne cherche pas avec la clé de test." };
    }
    if (!input.fetchImpl) {
      return { hotels: catalog, flights: [], transfers: [], mode, reason: "Clé de staging absente. Aucun appel." };
    }
    return { hotels: catalog, flights: [], transfers: [], mode, reason: "L’appel staging n’est pas armé dans cette version." };
  }
  return {
    hotels: [...catalog, ...mockHotels(city)].slice(0, 3),
    flights: mockFlights(city),
    transfers: [
      {
        provider: "rolzo",
        kind: "transfer",
        title: `Transfert simulé ${city}`,
        city,
        net: null,
        currency: "EUR",
        commissionable: false,
        hotelCommission: null,
        simulated: true,
        note: "Rolzo n’est pas appelé. Le devis chauffeur attend l’agence.",
      },
    ],
    mode,
    reason: "Simulation.",
  };
}
