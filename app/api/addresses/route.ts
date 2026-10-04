import { NextResponse } from "next/server";
import { searchAddresses } from "@/lib/crm/address-suggest";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

/** Relais vers les services d’adresses : 60 appels par minute et par adresse IP (C-19). */
export async function GET(request: Request) {
  const allowed = await rateLimit({
    key: rateLimitKey("addresses:ip", requestIp(request.headers)),
    limit: 60,
    windowSeconds: 60,
  });
  if (!allowed) return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  const url = new URL(request.url);
  const hits = await searchAddresses(url.searchParams.get("q") || "", url.searchParams.get("near"));
  return NextResponse.json({ hits });
}
