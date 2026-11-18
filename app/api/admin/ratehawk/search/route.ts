import { RatehawkConfigError, safeConfig } from "@/lib/crm/ratehawk/config";
import { fillThinHotelFacts } from "@/lib/crm/ratehawk/content";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { validateStay, type RoomGuests } from "@/lib/crm/ratehawk/limits";
import { searchGeo, searchHids, searchRegion, withStoredFacts, type HotelCard, type StoredHotelFacts } from "@/lib/crm/ratehawk/search";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const config = safeConfig();
  if (!config?.keyId) return ratehawkJson({ error: "Ratehawk n’est pas configuré." }, 503);
  const body = (await request.json().catch(() => null)) as {
    mode?: string;
    region_id?: number;
    latitude?: number;
    longitude?: number;
    radius?: number;
    hids?: number[];
    checkin?: string;
    checkout?: string;
    residency?: string;
    guests?: RoomGuests[];
  } | null;
  if (!body?.checkin || !body.checkout || !body.guests) return ratehawkJson({ error: "Recherche incomplète." }, 400);
  const stayError = validateStay({
    checkin: body.checkin,
    checkout: body.checkout,
    residency: body.residency || "",
    guests: body.guests,
    hids: body.mode === "hids" ? body.hids : undefined,
  });
  if (stayError) return ratehawkJson({ error: stayError }, 400);
  const input = {
    checkin: body.checkin,
    checkout: body.checkout,
    residency: (body.residency || "").toLowerCase(),
    guests: body.guests,
    currency: config.currency,
    timeout: config.searchTimeoutSeconds,
  };
  try {
    if (body.mode === "region") {
      if (!Number.isInteger(body.region_id)) return ratehawkJson({ error: "Choisissez une destination." }, 400);
      const result = await searchRegion(input, body.region_id as number, config);
      return ratehawkJson({ hotels: await withStaticFacts(result.hotels, config), error: result.call.error });
    }
    if (body.mode === "geo") {
      if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
        return ratehawkJson({ error: "Les coordonnées sont incomplètes." }, 400);
      }
      const radius = Math.min(70_000, Math.max(1, Math.trunc(body.radius || 5_000)));
      const result = await searchGeo(input, body.latitude, body.longitude, radius, config);
      return ratehawkJson({ hotels: await withStaticFacts(result.hotels, config), error: result.call.error });
    }
    const result = await searchHids(input, body.hids || [], config);
    return ratehawkJson({ hotels: await withStaticFacts(result.hotels, config), error: result.call.error });
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "La recherche Ratehawk a échoué.";
    return ratehawkJson({ error: message }, 502);
  }
}

/** Nom, étoiles, adresse et photo du contenu statique. Le slug et le hid ne sortent pas. */
async function withStaticFacts(hotels: HotelCard[], config: NonNullable<ReturnType<typeof safeConfig>>): Promise<HotelCard[]> {
  if (!hotels.length) return hotels;
  const hids = hotels.map((hotel) => hotel.hid);
  try {
    await fillThinHotelFacts(hids.slice(0, 8), config);
    const { data } = await ratehawkDb()
      .from("crm_ratehawk_hotels")
      .select("hid, name, address, star_rating, images, images_ext:raw->images_ext")
      .in("hid", hids);
    const stored = (data || []).map((row) => ({
      hid: Number(row.hid),
      name: typeof row.name === "string" ? row.name : null,
      address: typeof row.address === "string" ? row.address : null,
      star_rating: row.star_rating == null ? null : Number(row.star_rating),
      images: row.images,
      images_ext: row.images_ext,
    })) satisfies StoredHotelFacts[];
    return withStoredFacts(hotels, stored);
  } catch {
    return withStoredFacts(hotels, []);
  }
}
