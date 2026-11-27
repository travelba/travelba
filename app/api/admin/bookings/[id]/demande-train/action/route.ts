import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { TRAIN_DESK_ACTIONS, type TrainDeskAction } from "@/lib/crm/train-desk";
import { loadTrainDeskRow, runTrainDesk } from "@/lib/crm/train-desk-run";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const demande = typeof body?.demande === "string" ? body.demande : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!UUID.test(demande) || !TRAIN_DESK_ACTIONS.includes(action as TrainDeskAction)) return jsonError("Action invalide.");
  const admin = createServiceClient();
  const loaded = await loadTrainDeskRow(admin, demande, id);
  if ("error" in loaded) return jsonError(loaded.error || "Demande introuvable.", loaded.error?.includes("migration") ? 400 : 404);
  const result = await runTrainDesk(admin, loaded.row, action as TrainDeskAction, {
    envoyer: true,
    texte: typeof body?.texte === "string" ? body.texte : "",
    ia: body?.ia === false ? false : body?.ia === true ? true : null,
    aller_date: typeof body?.aller_date === "string" ? body.aller_date : "",
    retour_date: typeof body?.retour_date === "string" ? body.retour_date : "",
    aller_creneau: typeof body?.aller_creneau === "string" ? body.aller_creneau : "",
    retour_creneau: typeof body?.retour_creneau === "string" ? body.retour_creneau : "",
  });
  return NextResponse.json({ ok: true, texte: result.texte, envoye: result.envoye, raison: "raison" in result ? result.raison : "" });
}
