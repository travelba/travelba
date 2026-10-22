import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import {
  hotelSearchAllowed,
  mergePlaceSuggestions,
  readSuggestCache,
  suggestQuery,
  suggestionsFromCatalog,
  writeSuggestCache,
  type PlaceSuggestion,
} from "@/lib/crm/hotel-search";
import { loadLittleEmperorsSuggestions } from "@/lib/crm/little-emperors-search";
import { foldHotelLabel } from "@/lib/crm/hotel-catalog";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 15;

async function catalogSuggestions(query: string): Promise<PlaceSuggestion[]> {
  try {
    const db = createServiceClient();
    const like = `%${query.replace(/[%_\\]/g, "")}%`;
    const [cities, names] = await Promise.all([
      db.from("crm_le_hotels").select("le_hotel_id, hotel_name, city").ilike("city", like).limit(12),
      db.from("crm_le_hotels").select("le_hotel_id, hotel_name, city").ilike("hotel_name", like).limit(12),
    ]);
    const rows = [...(cities.data || []), ...(names.data || [])] as {
      le_hotel_id: number;
      hotel_name: string;
      city: string;
    }[];
    return suggestionsFromCatalog(rows, query);
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  if (!hotelSearchAllowed(auth.customer)) return jsonError("Introuvable", 404);
  const query = suggestQuery(new URL(request.url).searchParams.get("q"));
  if (!query) return NextResponse.json({ suggestions: [] });
  const key = foldHotelLabel(query);
  const cached = readSuggestCache(key);
  if (cached) return NextResponse.json({ suggestions: cached });
  const [catalog, remote] = await Promise.all([catalogSuggestions(query), loadLittleEmperorsSuggestions(query)]);
  const suggestions = mergePlaceSuggestions([catalog, remote || []]);
  if (remote) writeSuggestCache(key, suggestions);
  return NextResponse.json({ suggestions });
}
