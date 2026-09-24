import { entryOpenRequested, entryUserActivated } from "@/lib/crm/entry-link";
import { entryPreviewResponse, redirectEntryToCallback } from "@/lib/crm/entry-open";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

/** Adresse prévisualisée par le bouton. Même ouverture que `/e/CODE`. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  const safe = code.trim().toUpperCase();
  if (entryOpenRequested(url.search) || entryUserActivated(request.headers.get("sec-fetch-user"))) {
    return redirectEntryToCallback(originOf(), safe);
  }
  return entryPreviewResponse(originOf(), safe);
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return redirectEntryToCallback(originOf(), code.trim().toUpperCase());
}
