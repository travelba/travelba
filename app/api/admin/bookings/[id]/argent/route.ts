import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { loadDossierArgent } from "@/lib/crm/dossier-argent";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Lecture ciblée des montants du dossier. Le changement d’onglet ne la coupe pas. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const payload = await loadDossierArgent(auth.supabase, id);
  if (!payload) return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  return NextResponse.json(payload);
}
