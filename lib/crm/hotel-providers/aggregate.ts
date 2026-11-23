import { perNightCents, priceStayOffer, type ClientCompareRate, type HotelOffer, type PricedStay } from "@/lib/crm/hotel-search";
import { decideHotelMatch, type MatchDecision } from "./matching";
import type { NormalizedRate } from "./types";

export type AgentCompareRate = ClientCompareRate & {
  provider: "little_emperors" | "expedia";
  bookable: boolean;
};

export type FoldedRates = {
  updates: Array<{ hotelKey: string; compares: AgentCompareRate[] }>;
  created: Array<{ stay: PricedStay; compares: AgentCompareRate[] }>;
  reviews: Array<{ leName: string; expediaName: string; city: string; confidence: number }>;
  links: Array<{
    canonicalName: string;
    canonicalCity: string;
    lat: number | null;
    lng: number | null;
    leHotelId: string | null;
    leName: string | null;
    expediaHotelId: string;
    expediaName: string;
    decision: MatchDecision;
  }>;
};

function membreRate(stay: PricedStay, nights: number, audience: "client" | "agent"): AgentCompareRate {
  return {
    kind: "membre",
    provider: "little_emperors",
    label: audience === "agent" ? "Little Emperors" : "Offre membre",
    sellCents: stay.sellCents,
    perNightCents: perNightCents(stay.sellCents, nights),
    currency: stay.currency,
    taxesCents: null,
    dueAtPropertyCents: null,
    cancellation: stay.cancellation || (stay.perks.freeCancellation ? "Annulation gratuite" : ""),
    refundable: stay.perks.freeCancellation,
    legalLines: [],
    bookable: true,
  };
}

function autreRate(rate: NormalizedRate, nights: number, audience: "client" | "agent"): AgentCompareRate {
  return {
    kind: "autre",
    provider: "expedia",
    label: audience === "agent" ? "Expedia" : "Autre tarif",
    sellCents: rate.price.totalInclusiveCents,
    perNightCents: perNightCents(rate.price.totalInclusiveCents, nights),
    currency: rate.currency,
    taxesCents: rate.price.taxesAndServiceFeesCents,
    dueAtPropertyCents: rate.price.dueAtPropertyCents,
    cancellation: rate.cancellation.text,
    refundable: rate.cancellation.refundable,
    legalLines: rate.legalLines,
    bookable: false,
  };
}

function offerFromRate(rate: NormalizedRate): HotelOffer {
  return {
    account: "expedia",
    hotelName: rate.hotel.name,
    city: rate.hotel.city,
    proposed: rate.price.totalInclusiveCents / 100,
    currency: rate.currency,
    roomLabel: rate.room.label,
    photoUrl: rate.room.images?.[0] || null,
    images: rate.room.images || [],
    coords: rate.hotel.coords || null,
    freeCancellation: rate.cancellation.refundable,
    cancellation: rate.cancellation.text,
    stars: rate.hotel.stars ?? null,
    rateKey: `ex${rate.providerHotelId}`.slice(0, 80),
    benefits: [],
  };
}

type Pair = { stay: PricedStay; decision: MatchDecision };

function bestPair(rate: NormalizedRate, stays: PricedStay[]): Pair | null {
  let best: Pair | null = null;
  for (const stay of stays) {
    const decision = decideHotelMatch(
      {
        name: stay.hotelName,
        city: stay.city,
        lat: stay.coords?.lat,
        lng: stay.coords?.lng,
      },
      {
        name: rate.hotel.name,
        city: rate.hotel.city,
        address: rate.hotel.address,
        lat: rate.hotel.coords?.lat,
        lng: rate.hotel.coords?.lng,
      }
    );
    if (decision.status === "none") continue;
    const closer =
      !best ||
      (decision.status === "confirmed" && best.decision.status !== "confirmed") ||
      (decision.status === best.decision.status && decision.confidence > best.decision.confidence);
    if (closer) best = { stay, decision };
  }
  return best;
}

/**
 * Un tarif par fournisseur et par hôtel. Confirmé : les deux offres sur la même carte.
 * Douteux : cartes séparées, et une ligne à vérifier.
 */
export function foldProviderRates(input: {
  stays: PricedStay[];
  expedia: NormalizedRate[];
  nights: number;
  audience: "client" | "agent";
  confirmedKeys?: Map<string, string>;
}): FoldedRates {
  const byKey = new Map(input.stays.map((stay) => [stay.hotelKey, stay]));
  const grouped = new Map<string, { stay: PricedStay; expedia: NormalizedRate | null }>();
  for (const stay of input.stays) grouped.set(stay.hotelKey, { stay, expedia: null });
  const created: FoldedRates["created"] = [];
  const reviews: FoldedRates["reviews"] = [];
  const links: FoldedRates["links"] = [];
  const seenExpedia = new Set<string>();

  for (const rate of input.expedia) {
    if (seenExpedia.has(rate.providerHotelId)) continue;
    seenExpedia.add(rate.providerHotelId);
    const linkedKey = input.confirmedKeys?.get(rate.providerHotelId);
    const linked = linkedKey ? byKey.get(linkedKey) : undefined;
    const pair = linked ? { stay: linked, decision: { status: "confirmed" as const, method: "geo_name" as const, confidence: 1, distanceKm: null } } : bestPair(rate, input.stays);
    if (pair?.decision.status === "confirmed") {
      const current = grouped.get(pair.stay.hotelKey);
      if (current && !current.expedia) current.expedia = rate;
      else if (!current) grouped.set(pair.stay.hotelKey, { stay: pair.stay, expedia: rate });
      links.push({
        canonicalName: pair.stay.hotelName,
        canonicalCity: pair.stay.city,
        lat: pair.stay.coords?.lat ?? rate.hotel.coords?.lat ?? null,
        lng: pair.stay.coords?.lng ?? rate.hotel.coords?.lng ?? null,
        leHotelId: pair.stay.hotelId ? String(pair.stay.hotelId) : null,
        leName: pair.stay.hotelName,
        expediaHotelId: rate.providerHotelId,
        expediaName: rate.hotel.name,
        decision: pair.decision,
      });
      continue;
    }
    if (pair?.decision.status === "proposed") {
      reviews.push({
        leName: pair.stay.hotelName,
        expediaName: rate.hotel.name,
        city: pair.stay.city || rate.hotel.city,
        confidence: pair.decision.confidence,
      });
      links.push({
        canonicalName: pair.stay.hotelName,
        canonicalCity: pair.stay.city,
        lat: pair.stay.coords?.lat ?? rate.hotel.coords?.lat ?? null,
        lng: pair.stay.coords?.lng ?? rate.hotel.coords?.lng ?? null,
        leHotelId: pair.stay.hotelId ? String(pair.stay.hotelId) : null,
        leName: pair.stay.hotelName,
        expediaHotelId: rate.providerHotelId,
        expediaName: rate.hotel.name,
        decision: pair.decision,
      });
    }
    const offer = offerFromRate(rate);
    const stay = priceStayOffer(offer);
    if (!stay || byKey.has(stay.hotelKey)) continue;
    created.push({ stay, compares: [autreRate(rate, input.nights, input.audience)] });
  }

  const updates: FoldedRates["updates"] = [];
  for (const group of grouped.values()) {
    if (!group.expedia) continue;
    updates.push({
      hotelKey: group.stay.hotelKey,
      compares: [membreRate(group.stay, input.nights, input.audience), autreRate(group.expedia, input.nights, input.audience)],
    });
  }
  return { updates, created, reviews, links };
}

export function clientCompares(rates: AgentCompareRate[]): ClientCompareRate[] {
  return rates.map((rate) => ({
    kind: rate.kind,
    label: rate.label,
    sellCents: rate.sellCents,
    perNightCents: rate.perNightCents,
    currency: rate.currency,
    taxesCents: rate.taxesCents,
    dueAtPropertyCents: rate.dueAtPropertyCents,
    cancellation: rate.cancellation,
    refundable: rate.refundable,
    legalLines: rate.legalLines,
  }));
}
