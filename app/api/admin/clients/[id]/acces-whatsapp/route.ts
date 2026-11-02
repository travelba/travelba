import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { sendClientAccessWhatsapp } from "@/lib/crm/access-resend-send";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Renvoie les accès par WhatsApp. La confirmation est le clic. Aucun mot de passe, aucun lien dans la réponse. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const result = await sendClientAccessWhatsapp({
    customerId: id,
    staffId: auth.staff.id,
    actor: auth.staff.full_name || "l’agence",
    path: `/api/admin/clients/${id}/acces-whatsapp`,
    confirmer: true,
  });
  if (!result.ok) return jsonError(result.message, result.httpStatus);
  return NextResponse.json({ ok: true, twilio_sid: result.sid, statut: result.statut });
}
