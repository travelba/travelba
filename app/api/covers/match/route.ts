import { NextResponse } from "next/server";
import { photoForUnknownPlace } from "@/lib/crm/cover-geo";
import { isCatalogPhotoId } from "@/lib/crm/cover-retouch";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

/** Photo de catalogue pour un lieu écrit qui n’est pas déjà dans le dossier. 60 appels / min / IP (C-19). */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 160) return NextResponse.json({ photo: null });
  const allowed = await rateLimit({
    key: rateLimitKey("covers-match:ip", requestIp(request.headers)),
    limit: 60,
    windowSeconds: 60,
  });
  if (!allowed) return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  const photo = await photoForUnknownPlace(q);
  if (!photo || !isCatalogPhotoId(photo)) return NextResponse.json({ photo: null });
  return NextResponse.json({ photo });
}
