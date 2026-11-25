import { RatehawkConfigError, safeConfig } from "@/lib/crm/ratehawk/config";
import { fillThinHotelFacts } from "@/lib/crm/ratehawk/content";
import { readHotelFacts, type RoomGroupStatic } from "@/lib/crm/ratehawk/display";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { validateStay, type RoomGuests } from "@/lib/crm/ratehawk/limits";
import { hotelPage } from "@/lib/crm/ratehawk/search";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

export async function POST(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const config = safeConfig();
  if (!config?.keyId) return ratehawkJson({ error: "Ratehawk n’est pas configuré." }, 503);
  const body = (await request.json().catch(() => null)) as {
    hid?: number;
    checkin?: string;
    checkout?: string;
    residency?: string;
    guests?: RoomGuests[];
  } | null;
  if (!body?.hid || !body.checkin || !body.checkout || !body.guests) return ratehawkJson({ error: "Fiche hôtel incomplète." }, 400);
  const stayError = validateStay({
    checkin: body.checkin,
    checkout: body.checkout,
    residency: body.residency || "",
    guests: body.guests,
  });
  if (stayError) return ratehawkJson({ error: stayError }, 400);
  try {
    const columns =
      "name, address, star_rating, metapolicy_struct, metapolicy_extra_info, room_groups, check_in_time, check_out_time, images, images_ext:raw->images_ext, description_struct:raw->description_struct, amenity_groups:raw->amenity_groups, policy_struct:raw->policy_struct";
    await fillThinHotelFacts([body.hid], config).catch(() => undefined);
    const own = await auth.supabase.from("crm_ratehawk_hotels").select(columns).eq("hid", body.hid).maybeSingle();
    let data = own.data;
    if (!data) {
      try {
        const fallback = await ratehawkDb().from("crm_ratehawk_hotels").select(columns).eq("hid", body.hid).maybeSingle();
        data = fallback.data;
      } catch {
        data = null;
      }
    }
    const groups = (Array.isArray(data?.room_groups) ? data.room_groups : []) as RoomGroupStatic[];
    const facts = readHotelFacts(data, body.hid);
    const result = await hotelPage(
      {
        checkin: body.checkin,
        checkout: body.checkout,
        residency: (body.residency || "").toLowerCase(),
        guests: body.guests,
        currency: config.currency,
        timeout: config.searchTimeoutSeconds,
      },
      body.hid,
      config,
      groups
    );
    const images = facts?.images || [];
    return ratehawkJson({
      hotel: result.hotel
        ? {
            ...result.hotel,
            name: facts?.name || result.hotel.name,
            address: facts?.address ?? null,
            star_rating: facts?.star_rating ?? null,
            images: images.length ? images : result.hotel.images,
          }
        : null,
      static: facts,
      error: result.call.error,
    });
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "La fiche hôtel Ratehawk a échoué.";
    return ratehawkJson({ error: message }, 502);
  }
}
