import { openAccessToken } from "@/lib/crm/access-open";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/** Le jeton est dans le chemin. Il n’est ni journalisé ni réécrit. */
export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return openAccessToken(request, token);
}

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  return openAccessToken(request, token, { forceOpen: true });
}
