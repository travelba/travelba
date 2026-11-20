import type { BookOutcome, CancelOutcome } from "@/lib/crm/hotel-supplier";
import type { HotelRoomOccupancy } from "@/lib/crm/hotel-search";

export type ProviderId = "little_emperors" | "expedia" | "ratehawk";

export type SalesAudience = "client" | "agent";

export type SearchChannel = "client_web" | "client_mobile" | "agent_desktop" | "agent_mobile";

export type ProviderCapabilities = {
  suggest: boolean;
  searchByHotel: boolean;
  searchByCity: boolean;
  priceCheck: boolean;
  bookApi: boolean;
  cancelApi: boolean;
  content: boolean;
  paymentModes: Array<"client_card_frame" | "agency_vcc" | "property_collect" | "supplier_collect" | "deposit">;
};

export type SearchContext = {
  checkIn: string;
  checkOut: string;
  rooms: HotelRoomOccupancy[];
  currency: string;
  channel: SearchChannel;
  residency?: string;
  signal?: AbortSignal;
};

export type LatLng = { lat: number; lng: number };

export type NormalizedMoney = {
  /** Total TTC tel que le fournisseur le donne, en centimes entiers. */
  totalInclusiveCents: number;
  /** Chaîne d’origine quand le fournisseur l’envoie. Expedia : ne pas la réarrondir. */
  totalInclusive?: string;
  currency: string;
  baseRateCents: number | null;
  taxesAndServiceFeesCents: number | null;
  dueAtPropertyCents: number | null;
  strikethroughCents: number | null;
  payNowCents: number;
  payLaterCents: number;
};

export type NormalizedCancellation = {
  refundable: boolean;
  freeUntil: string | null;
  penalties: Array<{
    start: string;
    end: string;
    kind: "amount" | "nights" | "percent";
    value: string;
    currency?: string;
  }>;
  text: string;
};

export type NormalizedRate = {
  provider: ProviderId;
  providerHotelId: string;
  /** Jeton opaque. Serveur seulement : jamais recopié vers le client. */
  providerRateToken: unknown;
  hotel: {
    name: string;
    city: string;
    country?: string;
    stars?: number | null;
    coords?: LatLng | null;
    address?: string | null;
  };
  room: { label: string; images?: string[] };
  currency: string;
  price: NormalizedMoney;
  agency: {
    supplierCostCents: number | null;
    commissionPct: number | null;
    commissionCents: number | null;
    markupCents: number;
    discountCents: number;
    earningCents: number | null;
    earningKind: "commission" | "markup" | "none" | "unknown";
  };
  cancellation: NormalizedCancellation;
  payment: {
    collect: "supplier" | "property" | "agency_deposit";
    merchantOfRecord: "supplier" | "property" | "unknown";
    needsCard: boolean;
  };
  perks: string[];
  legalLines: string[];
  expiresAt: string;
};

export type PriceCheckResult =
  | { ok: true; sellCents: number; currency: string }
  | { ok: false; reason: "expired" | "unavailable" | "price_changed" | "not_contracted" | "not_open" };

export type BookInput = {
  idempotencyKey: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  sellCents: number;
  currency: string;
  expiresAt: string;
  partnerRate: boolean;
};

export type BookResult = { ok: true; outcome: BookOutcome } | { ok: false; reason: "not_open" | "not_contracted" };

export type CancelInput = { idempotencyKey: string; confirmation: string | null; paid: boolean };

export type CancelResult = { ok: true; outcome: CancelOutcome } | { ok: false; reason: "not_open" | "not_contracted" };

/**
 * Contrat commun. La recherche Expedia l’implémente en lecture.
 * Réserver et annuler existent pour la suite : Expedia répond `not_open`.
 * Little Emperors reprend les mêmes issues que le port déjà en production.
 */
export interface HotelProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  configured(): boolean;
  priceCheck(input: BookInput, nowIso: string): PriceCheckResult;
  book(input: BookInput): BookResult;
  cancel(input: CancelInput): CancelResult;
}
