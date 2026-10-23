import { RatehawkConfigError, safeConfig } from "@/lib/crm/ratehawk/config";
import { prebookRate } from "@/lib/crm/ratehawk/book";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { moneyNumber } from "@/lib/crm/ratehawk/pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 70;

export async function POST(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  if (!safeConfig()?.keyId) return ratehawkJson({ error: "Ratehawk n’est pas configuré." }, 503);
  const body = (await request.json().catch(() => null)) as { hash?: string; hid?: number; show_amount?: string } | null;
  if (!body?.hash || !body.hid) return ratehawkJson({ error: "Tarif incomplet." }, 400);
  const baseline = moneyNumber(body.show_amount);
  if (baseline == null) return ratehawkJson({ error: "Prix de départ manquant." }, 400);
  try {
    const result = await prebookRate(body.hash, body.hid, baseline);
    if (!result.ok) return ratehawkJson({ error: result.error || "Tarif indisponible." }, 409);
    return ratehawkJson({ rate: result.rate, quote: result.quote, price: result.price });
  } catch (caught) {
    const message = caught instanceof RatehawkConfigError ? caught.message : "La pré-réservation a échoué.";
    return ratehawkJson({ error: message }, 502);
  }
}
