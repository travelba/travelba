import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { McpWriteError, reconcilePliantDebit } from "@/lib/crm/mcp-write";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { transactionId?: string; action?: string } | null;
  const transactionId = (body?.transactionId || "").trim();
  if (!transactionId) return jsonError("Dépense introuvable.", 404);
  const admin = createServiceClient();

  if (body?.action === "refuse" || body?.action === "ignore") {
    const { data: row, error } = await admin
      .from("crm_pliant_transactions")
      .select("id, match_status")
      .eq("id", transactionId)
      .maybeSingle();
    if (error) return jsonError("Dépense introuvable.", 404);
    const movement = row as { id: string; match_status: string | null } | null;
    if (!movement) return jsonError("Dépense introuvable.", 404);
    if (movement.match_status === "matched") return jsonError("Déjà rapprochée.");
    const { error: updateError } = await admin
      .from("crm_pliant_transactions")
      .update({ match_status: "ignored" })
      .eq("id", transactionId);
    if (updateError) return jsonError("Impossible de refuser cette dépense.", 400);
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await reconcilePliantDebit({ mouvement_id: transactionId, dossier_id: id }, admin);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof McpWriteError) return jsonError(err.message);
    return jsonError("Rapprochement impossible. Réessayez.", 400);
  }
}
