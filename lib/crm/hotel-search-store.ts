import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { HotelSearchQuery, PricedStay } from "./hotel-search";

type Admin = ReturnType<typeof createServiceClient>;

function admin() {
  return createServiceClient();
}

function clip(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export async function saveHotelOffer(
  customerId: string,
  query: HotelSearchQuery,
  nights: number,
  stay: PricedStay
): Promise<string | null> {
  try {
    const db = admin();
    const expires = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("crm_hotel_search_offers")
      .upsert(
        {
          customer_id: customerId,
          hotel_key: stay.hotelKey,
          hotel_name: clip(stay.hotelName, 160),
          city: clip(stay.city, 80),
          room_label: stay.roomLabel ? clip(stay.roomLabel, 120) : null,
          photo_url: stay.photoUrl,
          thumb_url: stay.thumbUrl,
          sell_cents: stay.sellCents,
          currency: stay.currency,
          nights,
          check_in: query.checkIn,
          check_out: query.checkOut,
          adults: query.adults,
          benefits: stay.benefits,
          free_cancellation: stay.perks.freeCancellation,
          advantage_score: stay.score,
          account: stay.account,
          expires_at: expires,
        },
        { onConflict: "customer_id,hotel_key,check_in,check_out,adults" }
      )
      .select("id")
      .single();
    if (error) {
      console.error("[hotels] offre", error.code ?? "?");
      return null;
    }
    const id = (data as { id?: string } | null)?.id;
    return typeof id === "string" ? id : null;
  } catch (err) {
    console.error("[hotels] offre", err instanceof Error ? "indisponible" : "échec");
    return null;
  }
}

export async function createHotelRequest(customerId: string, offerId: string) {
  const db = admin();
  const { data: offer, error } = await db
    .from("crm_hotel_search_offers")
    .select(
      "id, customer_id, hotel_name, city, room_label, check_in, check_out, adults, sell_cents, currency, benefits, account, expires_at"
    )
    .eq("id", offerId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error || !offer) return { ok: false as const, message: "Cette offre n’est plus disponible." };
  const row = offer as {
    id: string;
    hotel_name: string;
    city: string;
    room_label: string | null;
    check_in: string;
    check_out: string;
    adults: number;
    sell_cents: number;
    currency: string;
    benefits: unknown;
    account: string;
    expires_at: string;
  };
  if (Date.parse(row.expires_at) <= Date.now()) {
    return { ok: false as const, message: "Cette recherche a expiré. Relancez-la." };
  }
  const { data: pending } = await db
    .from("crm_hotel_search_requests")
    .select("id")
    .eq("customer_id", customerId)
    .eq("offer_id", offerId)
    .eq("status", "pending")
    .maybeSingle();
  if (pending?.id) {
    return { ok: true as const, message: "Demande envoyée. L’agence la valide avant tout paiement." };
  }
  const { error: insertError } = await db.from("crm_hotel_search_requests").insert({
    customer_id: customerId,
    offer_id: row.id,
    hotel_name: row.hotel_name,
    city: row.city,
    room_label: row.room_label,
    check_in: row.check_in,
    check_out: row.check_out,
    adults: row.adults,
    sell_cents: row.sell_cents,
    currency: row.currency,
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    account: row.account,
  });
  if (insertError) {
    console.error("[hotels] demande", insertError.code ?? "?");
    return { ok: false as const, message: "La demande n’a pas pu être envoyée." };
  }
  return { ok: true as const, message: "Demande envoyée. L’agence la valide avant tout paiement." };
}

export type HotelRequestRow = {
  id: string;
  customer_id: string;
  status: "pending" | "refused" | "issued" | "locked";
  hotel_name: string;
  city: string;
  room_label: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  sell_cents: number;
  currency: string;
  benefits: string[];
  account: string;
  pliant_card_id: string | null;
  created_at: string;
};

export async function listHotelRequests(): Promise<HotelRequestRow[]> {
  const db = admin();
  const { data, error } = await db
    .from("crm_hotel_search_requests")
    .select(
      "id, customer_id, status, hotel_name, city, room_label, check_in, check_out, adults, sell_cents, currency, benefits, account, pliant_card_id, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    console.error("[hotels] demandes", error.code ?? "?");
    return [];
  }
  return ((data || []) as HotelRequestRow[]).map((row) => ({
    ...row,
    benefits: Array.isArray(row.benefits) ? row.benefits.filter((line) => typeof line === "string") : [],
  }));
}

export async function loadRequestCustomers(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return new Map<string, { first_name: string; last_name: string }>();
  const db = admin();
  const { data, error } = await db.from("crm_customers").select("id, first_name, last_name").in("id", unique);
  if (error) return new Map<string, { first_name: string; last_name: string }>();
  return new Map(
    ((data || []) as { id: string; first_name: string; last_name: string }[]).map((row) => [
      row.id,
      { first_name: row.first_name, last_name: row.last_name },
    ])
  );
}

export async function readHotelRequest(id: string) {
  const db = admin();
  const { data, error } = await db.from("crm_hotel_search_requests").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as HotelRequestRow & { customer_id: string };
}

export async function markHotelRequest(
  id: string,
  patch: Record<string, unknown>,
  db: Admin = admin()
) {
  const { error } = await db.from("crm_hotel_search_requests").update(patch).eq("id", id);
  if (error) {
    console.error("[hotels] demande", error.code ?? "?");
    return false;
  }
  return true;
}

export { admin as hotelSearchAdmin };
