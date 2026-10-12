import { openEntry, serveEntryGet } from "@/lib/crm/entry-open";
import { entryRequestOrigin } from "@/lib/crm/entry-link";
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

/** Robot : carte du séjour. Humain : porte immédiate, puis la session. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return serveEntryGet(request, originOf(request), normalizeCode(code));
}

/** Vérifie le jeton, pose la session, ouvre la réservation. Jamais /connexion. */
export async function POST(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return openEntry(originOf(request), normalizeCode(code));
}
