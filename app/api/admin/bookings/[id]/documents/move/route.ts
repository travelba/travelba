import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { deplacerPieceDossier } from "@/lib/crm/mcp-dossier-pieces";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Déplace une pièce vers un autre dossier du même client. Le fichier n’est pas copié. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    document_id?: string;
    piece_id?: string;
    dossier_cible?: string;
    carte_id?: string | null;
  } | null;
  const pieceId = String(body?.piece_id || body?.document_id || "");
  const cible = String(body?.dossier_cible || "");
  if (!pieceId || !cible) return jsonError("Pièce et dossier cible requis.");
  try {
    const moved = await deplacerPieceDossier(
      {
        piece_id: pieceId,
        dossier_id: id,
        dossier_cible: cible,
        carte_id: body?.carte_id || undefined,
        confirmer: true,
      },
      {
        admin: createServiceClient(),
        actor: { id: auth.staff.id, name: auth.staff.full_name || "Agence" },
      }
    );
    return NextResponse.json({ ok: true, ...moved });
  } catch (err) {
    if (err instanceof McpWriteError) return jsonError(err.message, 400);
    console.error("[documents/move]", err instanceof Error ? err.message : "error");
    return jsonError("Déplacement impossible.", 400);
  }
}
