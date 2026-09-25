import { entryPreviewResponse, redirectEntryToCallback } from "@/lib/crm/entry-open";
import { shouldServePreview } from "@/lib/crm/entry-link";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

/** Le robot reste sur l’aperçu. Un visiteur entre dans l’espace, déjà connecté. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const safe = code.trim().toUpperCase();
  if (previewFor(request)) return entryPreviewResponse(originOf(), safe);
  return redirectEntryToCallback(originOf(), safe);
}

function previewFor(request: Request) {
  return shouldServePreview(request.headers.get("user-agent"), request.headers.get("sec-fetch-user"), {
    mode: request.headers.get("sec-fetch-mode"),
    dest: request.headers.get("sec-fetch-dest"),
    site: request.headers.get("sec-fetch-site"),
  });
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return redirectEntryToCallback(originOf(), code.trim().toUpperCase());
}
