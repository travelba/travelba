import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { sendHotelOptionWhatsapp } from "@/lib/crm/access-resend-send";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Annonce l’accès Hôtels déjà activé. La confirmation est le clic. Aucun mot de passe dans le message. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const result = await sendHotelOptionWhatsapp({
    customerId: id,
    staffId: auth.staff.id,
    actor: auth.staff.full_name || "l’agence",
    path: `/api/admin/clients/${id}/hotels/annoncer`,
    confirmer: true,
  });
  if (!result.ok) return jsonError(result.message, result.httpStatus);
  return NextResponse.json({ ok: true, twilio_sid: result.sid, statut: result.statut });
}
