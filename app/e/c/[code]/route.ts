import { entryPreviewResponse, redirectEntryToCallback } from "@/lib/crm/entry-open";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

/** Le GET reste l’aperçu, même si le client ressemble à un appui. */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return entryPreviewResponse(originOf(), code.trim().toUpperCase());
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return redirectEntryToCallback(originOf(), code.trim().toUpperCase());
}
