import { RatehawkConfigError } from "@/lib/crm/ratehawk/config";
import { fetchOrderInfoIfDue, pollBooking } from "@/lib/crm/ratehawk/book";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => null)) as { partner_order_id?: string } | null;
  if (!body?.partner_order_id) return ratehawkJson({ error: "Réservation manquante." }, 400);
  try {
    const result = await pollBooking(body.partner_order_id);
    if (result.ok && result.status === "success") await fetchOrderInfoIfDue(body.partner_order_id);
    return ratehawkJson(result, result.ok ? 200 : 404);
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "Le statut Ratehawk est indisponible.";
    return ratehawkJson({ error: message }, 502);
  }
}
