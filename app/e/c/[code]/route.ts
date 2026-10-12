import { entryPreviewResponse, openEntry } from "@/lib/crm/entry-open";
import { entryRequestOrigin, shouldOpenFromRequest } from "@/lib/crm/entry-link";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf(request: Request) {
  const fallback = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
  return entryRequestOrigin(request, fallback);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

/** Aperçu pour le robot. Un appui humain entre dans l’espace. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const safe = normalizeCode(code);
  const search = new URL(request.url).search;
  if (shouldOpenFromRequest(request.url, request.headers)) return openEntry(originOf(request), safe, search);
  return entryPreviewResponse(originOf(request), safe, true, search);
}

/** Vérifie le jeton, pose la session, ouvre la réservation. Jamais /connexion. */
export async function POST(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return openEntry(originOf(request), normalizeCode(code), new URL(request.url).search);
}
