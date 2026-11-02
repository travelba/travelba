import { RatehawkConfigError } from "@/lib/crm/ratehawk/config";
import { startBooking } from "@/lib/crm/ratehawk/book";
import { ratehawkJson, requestIp, staffOrResponse } from "@/lib/crm/ratehawk/http";
import type { FinishGuest, RoomGuests } from "@/lib/crm/ratehawk/limits";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as {
    quote?: string;
    hid?: number;
    hotel_name?: string;
    checkin?: string;
    checkout?: string;
    residency?: string;
    guests?: RoomGuests[];
    rooms?: { guests: FinishGuest[] }[];
    price_accepted?: boolean;
    accept_form_price?: boolean;
    scenario?: string | null;
    dossier?: string | null;
    partner_order_id?: string | null;
  } | null;
  if (!body?.quote || !body.hid || !body.checkin || !body.checkout || !body.rooms || !body.guests) {
    return ratehawkJson({ error: "Réservation incomplète." }, 400);
  }
  try {
    const result = await startBooking({
      quoteToken: body.quote,
      hid: body.hid,
      hotelName: body.hotel_name || `Hôtel ${body.hid}`,
      checkin: body.checkin,
      checkout: body.checkout,
      residency: (body.residency || "").toLowerCase(),
      searched: body.guests,
      rooms: body.rooms,
      priceAccepted: Boolean(body.price_accepted),
      acceptFormPrice: Boolean(body.accept_form_price),
      scenario: body.scenario || null,
      dossier: body.dossier || null,
      userIp: requestIp(request),
      partnerOrderId: body.partner_order_id || null,
    });
    return ratehawkJson(result, result.ok ? 200 : result.status === "price_increase" ? 409 : 422);
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "La réservation Ratehawk a échoué.";
    return ratehawkJson({ error: message }, 502);
  }
}
