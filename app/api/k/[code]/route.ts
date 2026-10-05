import { NextResponse } from "next/server";
import { openCardLink } from "@/lib/crm/card-link-run";
import { rateLimit, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Ouverture du lien carte par l’hôtel (B-04). Le GET de la page n’ouvre rien : seul ce POST,
 * déclenché par le bouton, compte une ouverture, journalise et renvoie la carte.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const allowed = await rateLimit({
    key: rateLimitKey("card-link", requestIp(request.headers)),
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!allowed) {
    return noStore(NextResponse.json({ error: "Trop d’essais. Réessayez plus tard." }, { status: 429 }));
  }
  const result = await openCardLink(code);
  if (!result.ok) return noStore(NextResponse.json({ error: result.error }, { status: result.status }));
  return noStore(
    NextResponse.json({
      source: result.source,
      opens_left: result.opensLeft,
      widget: result.widget ?? null,
      file: result.file ?? null,
    })
  );
}
