import type { RatehawkConfig } from "./config";
import { requireConfig } from "./config";
import type { RoomGroupStatic } from "./display";
import { validateStay, type RoomGuests } from "./limits";
import {
  callFailed,
  completeQuery,
  hotelPage,
  presentHotels,
  RATEHAWK_LIST_CAP,
  searchHids,
  searchRegion,
  type CompletionChoice,
  type SearchHotelView,
  type SearchInput,
  type StoredHotelFacts,
} from "./search";
import { ratehawkDb } from "./store";
import type { EtgCall } from "./client";

export class RatehawkLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RatehawkLookupError";
  }
}

export type RatehawkLookup = {
  destination: string | null;
  regionId: number | null;
  hids: number[];
  fiche: boolean;
  checkin: string;
  checkout: string;
  residency: string;
  guests: RoomGuests[];
};

export type RatehawkSearchResult = {
  action: "rechercher";
  ecrit: false;
  envoye: false;
  fiche: boolean;
  arrivee: string;
  depart: string;
  residence: string;
  devise: string;
  langue: "en" | "fr";
  marge: number;
  prix: "net = prix ETG, vente = prix agence";
  destination: { type: "region" | "hotel"; id: number; nom?: string } | null;
  hotels: SearchHotelView[];
  tronque: boolean;
};

const PRICE_LABEL = "net = prix ETG, vente = prix agence" as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function intOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function parseRatehawkLookup(input: Record<string, unknown>, today = new Date()): RatehawkLookup {
  const checkin = text(input.arrivee);
  const checkout = text(input.depart);
  if (!checkin || !checkout || !Array.isArray(input.recherche) || input.recherche.length < 1) {
    throw new RatehawkLookupError("Recherche incomplète.");
  }
  const guests = input.recherche.map((row) => {
    const item = row && typeof row === "object" ? (row as { adultes?: unknown; enfants?: unknown }) : {};
    const adults = typeof item.adultes === "number" ? item.adultes : Number(item.adultes);
    const children = Array.isArray(item.enfants) ? item.enfants.map((age) => (typeof age === "number" ? age : Number(age))) : [];
    return { adults, children };
  });
  const hids: number[] = [];
  if (input.hid != null && input.hid !== "") {
    const hid = intOf(input.hid);
    if (hid == null || hid < 1) throw new RatehawkLookupError("Un identifiant d’hôtel est invalide.");
    hids.push(hid);
  }
  if (input.hids != null) {
    if (!Array.isArray(input.hids)) throw new RatehawkLookupError("Un identifiant d’hôtel est invalide.");
    for (const value of input.hids) {
      const hid = intOf(value);
      if (hid == null || hid < 1) throw new RatehawkLookupError("Un identifiant d’hôtel est invalide.");
      hids.push(hid);
    }
  }
  let regionId: number | null = null;
  if (input.region_id != null && input.region_id !== "") {
    regionId = intOf(input.region_id);
    if (regionId == null || regionId < 1) throw new RatehawkLookupError("Région invalide.");
  }
  const destination = text(input.destination) || null;
  if (destination && destination.length < 2 && !/^\d+$/.test(destination)) {
    throw new RatehawkLookupError("Destination trop courte.");
  }
  const residency = (text(input.residence) || "fr").toLowerCase();
  const stayError = validateStay(
    {
      checkin,
      checkout,
      residency,
      guests,
      hids: hids.length ? hids : undefined,
    },
    today
  );
  if (stayError) throw new RatehawkLookupError(stayError);
  if (!destination && regionId == null && hids.length === 0) {
    throw new RatehawkLookupError("Indiquez une destination, un region_id ou un hid.");
  }
  return {
    destination,
    regionId,
    hids,
    fiche: input.fiche === true,
    checkin,
    checkout,
    residency,
    guests,
  };
}

type LookupDeps = {
  config?: RatehawkConfig;
  complete?: typeof completeQuery;
  searchRegion?: typeof searchRegion;
  searchHids?: typeof searchHids;
  hotelPage?: typeof hotelPage;
  loadStatic?: (hids: number[]) => Promise<StoredHotelFacts[]>;
};

function destinationOf(choice: CompletionChoice | null, regionId: number | null, hids: number[]) {
  if (choice?.kind === "region") return { type: "region" as const, id: choice.id, nom: choice.nom };
  if (choice?.kind === "hotel") return { type: "hotel" as const, id: choice.hid, nom: choice.nom };
  if (regionId != null && hids.length === 0) return { type: "region" as const, id: regionId };
  if (hids.length === 1) return { type: "hotel" as const, id: hids[0] };
  return null;
}

function resultOf(
  query: RatehawkLookup,
  config: RatehawkConfig,
  destination: RatehawkSearchResult["destination"],
  hotels: SearchHotelView[],
  tronque: boolean,
  fiche: boolean
): RatehawkSearchResult {
  return {
    action: "rechercher",
    ecrit: false,
    envoye: false,
    fiche,
    arrivee: query.checkin,
    depart: query.checkout,
    residence: query.residency,
    devise: config.currency,
    langue: config.language,
    marge: config.marginPercent,
    prix: PRICE_LABEL,
    destination,
    hotels,
    tronque,
  };
}

async function loadStoredHotels(hids: number[]): Promise<StoredHotelFacts[]> {
  if (!hids.length) return [];
  try {
    const { data } = await ratehawkDb()
      .from("crm_ratehawk_hotels")
      .select("hid, name, address, star_rating, images, room_groups, images_ext:raw->images_ext")
      .in("hid", hids);
    return (data || []).map((row) => ({
      hid: Number(row.hid),
      name: typeof row.name === "string" ? row.name : null,
      address: typeof row.address === "string" ? row.address : null,
      star_rating: row.star_rating == null ? null : Number(row.star_rating),
      images: row.images,
      images_ext: row.images_ext,
      room_groups: (Array.isArray(row.room_groups) ? row.room_groups : []) as RoomGroupStatic[],
    }));
  } catch {
    return [];
  }
}

function ensureCall(call: EtgCall, empty: boolean, message: string) {
  if (!empty || !callFailed(call)) return;
  const code = call.error && /^[a-z0-9_]{1,48}$/.test(call.error) ? ` (${call.error})` : "";
  throw new RatehawkLookupError(`${message}${code}`);
}

export async function runRatehawkLookup(query: RatehawkLookup, deps: LookupDeps = {}): Promise<RatehawkSearchResult> {
  const config = deps.config ?? requireConfig();
  const loadStatic = deps.loadStatic ?? loadStoredHotels;
  const input: SearchInput = {
    checkin: query.checkin,
    checkout: query.checkout,
    residency: query.residency,
    guests: query.guests,
    currency: config.currency,
    timeout: config.searchTimeoutSeconds,
  };
  let hids = query.hids;
  let regionId = query.regionId;
  let choice: CompletionChoice | null = null;
  if (!hids.length && regionId == null && query.destination) {
    const done = await (deps.complete ?? completeQuery)(query.destination, config);
    ensureCall(done.call, !done.choice, "La destination Ratehawk est indisponible.");
    if (!done.choice) throw new RatehawkLookupError("Destination introuvable.");
    choice = done.choice;
    if (done.choice.kind === "hotel") hids = [done.choice.hid];
    else regionId = done.choice.id;
  }
  if (query.fiche) {
    if (hids.length !== 1) throw new RatehawkLookupError("La fiche hôtel demande un seul hid.");
    const stored = await loadStatic(hids);
    const groups = (stored.find((row) => row.hid === hids[0])?.room_groups || []) as RoomGroupStatic[];
    const page = await (deps.hotelPage ?? hotelPage)(input, hids[0], config, groups);
    ensureCall(page.call, !page.hotel, "La fiche hôtel Ratehawk a échoué.");
    const view = presentHotels(page.hotel ? [page.hotel] : [], stored, 1);
    const rates = page.hotel?.rates.length ?? 0;
    return resultOf(query, config, destinationOf(choice, null, hids), view.hotels, rates >= 200, true);
  }
  if (hids.length) {
    const slice = hids.slice(0, RATEHAWK_LIST_CAP);
    const found = await (deps.searchHids ?? searchHids)(input, slice, config);
    ensureCall(found.call, found.hotels.length === 0, "La recherche Ratehawk a échoué.");
    const stored = await loadStatic(found.hotels.map((hotel) => hotel.hid));
    const view = presentHotels(found.hotels, stored, RATEHAWK_LIST_CAP);
    return resultOf(query, config, destinationOf(choice, null, hids), view.hotels, hids.length > RATEHAWK_LIST_CAP || view.tronque, false);
  }
  if (regionId != null) {
    const found = await (deps.searchRegion ?? searchRegion)(input, regionId, config);
    ensureCall(found.call, found.hotels.length === 0, "La recherche Ratehawk a échoué.");
    const capped = found.hotels.slice(0, RATEHAWK_LIST_CAP);
    const stored = await loadStatic(capped.map((hotel) => hotel.hid));
    const view = presentHotels(capped, stored, RATEHAWK_LIST_CAP);
    return resultOf(query, config, destinationOf(choice, regionId, []), view.hotels, found.hotels.length > RATEHAWK_LIST_CAP || view.tronque, false);
  }
  throw new RatehawkLookupError("Indiquez une destination, un region_id ou un hid.");
}
