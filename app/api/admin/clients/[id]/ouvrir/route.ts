import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createDeskLink } from "@/lib/crm/desk-open";
import { appOrigin } from "@/lib/crm/invite";
import { rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * « Ouvrir l’espace client » (remplace le code maître ADMIN_CLIENT_CODE, B-06).
 * Lien court à usage unique, 10 minutes, journalisé avec l’agent. Rien n’est envoyé au client.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const allowed = await rateLimit({
    key: rateLimitKey("desk-open", auth.staff.id),
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return jsonError("Trop d’ouvertures en une heure. Réessayez plus tard.", 429);

  const result = await createDeskLink({ customerId: id, staffId: auth.staff.id, origin: appOrigin(request) });
  if (!result.ok) return jsonError(result.error, result.status);
  const response = NextResponse.json({ url: result.url, expires_at: result.expiresAt });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
