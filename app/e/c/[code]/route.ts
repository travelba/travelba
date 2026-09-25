import { entryPreviewResponse, redirectEntryToCallback } from "@/lib/crm/entry-open";
import { shouldServePreview } from "@/lib/crm/entry-link";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

/** Le robot reste sur l’aperçu. Un visiteur entre dans l’espace. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const safe = code.trim().toUpperCase();
  if (shouldServePreview(request.headers.get("user-agent"), request.headers.get("sec-fetch-user"))) {
    return entryPreviewResponse(originOf(), safe);
  }
  return redirectEntryToCallback(originOf(), safe);
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return redirectEntryToCallback(originOf(), code.trim().toUpperCase());
}
