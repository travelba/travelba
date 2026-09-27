import { entryPreviewResponse, openEntry } from "@/lib/crm/entry-open";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

/** Même règle que /e/c : le GET n’ouvre pas le jeton. */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return entryPreviewResponse(originOf(), normalizeCode(code));
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return openEntry(originOf(), normalizeCode(code));
}
