import { RatehawkConfigError, safeConfig } from "@/lib/crm/ratehawk/config";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { validateStay, type RoomGuests } from "@/lib/crm/ratehawk/limits";
import { hotelPage } from "@/lib/crm/ratehawk/search";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";
import { metapolicyLines, type RoomGroupStatic } from "@/lib/crm/ratehawk/display";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const supabase = ratehawkDb();
    const { data } = await supabase
      .from("crm_ratehawk_hotels")
      .select("name, address, metapolicy_struct, metapolicy_extra_info, room_groups, check_in_time, check_out_time, images")
      .eq("hid", body.hid)
      .maybeSingle();
    const groups = (Array.isArray(data?.room_groups) ? data.room_groups : []) as RoomGroupStatic[];
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
    return ratehawkJson({
      hotel: result.hotel,
      static: data
        ? {
            name: data.name,
            address: data.address,
            check_in_time: data.check_in_time,
            check_out_time: data.check_out_time,
            images: data.images,
            policies: metapolicyLines(data.metapolicy_struct, data.metapolicy_extra_info),
          }
        : null,
      error: result.call.error,
    });
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "La fiche hôtel Ratehawk a échoué.";
    return ratehawkJson({ error: message }, 502);
  }
}
