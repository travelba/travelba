import { entryPreviewResponse, openEntry } from "@/lib/crm/entry-open";
import { shouldOpenFromRequest } from "@/lib/crm/entry-link";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

/** Même règle que /e/c. */
export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const safe = normalizeCode(code);
  if (shouldOpenFromRequest(request.url, request.headers)) return openEntry(originOf(), safe);
  return entryPreviewResponse(originOf(), safe);
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return openEntry(originOf(), normalizeCode(code));
}
