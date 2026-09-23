import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { placesFromGeocode, type GeoPlace } from "@/lib/crm/places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) return NextResponse.json({ places: [] });

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "12");
  url.searchParams.set("language", "fr");
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return jsonError("Villes indisponibles", 502);
    const json = (await res.json()) as { results?: GeoPlace[] };
    return NextResponse.json({ places: placesFromGeocode(json.results) });
  } catch {
    return jsonError("Villes indisponibles", 502);
  }
}
