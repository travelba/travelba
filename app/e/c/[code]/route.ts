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

/** Aperçu pour tout le monde. Le script poste ; le robot ne l’exécute pas. */
export async function GET(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return entryPreviewResponse(originOf(), normalizeCode(code));
}

/** Vérifie le jeton, pose la session, ouvre la réservation. Jamais /connexion. */
export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return openEntry(originOf(), normalizeCode(code));
}
