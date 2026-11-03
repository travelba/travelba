import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { invalidatePublicContent } from "@/lib/crm/public-catalogue-load";
import type { PublicContentTarget } from "@/lib/crm/public-catalogue";

export const runtime = "nodejs";

const TARGETS = new Set(["classements", "guides", "fournisseurs", "tout"]);

/** Après une édition des classements, guides ou chambres fournisseur. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { cible?: unknown } | null;
  const cible = body?.cible;
  if (typeof cible !== "string" || !TARGETS.has(cible)) return jsonError("Cible inconnue");
  invalidatePublicContent(cible as PublicContentTarget | "tout");
  return NextResponse.json({ ok: true, cible });
}
