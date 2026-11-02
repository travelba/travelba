import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { sendBoardingPassWhatsapp, type BoardingPassSendInput } from "@/lib/crm/boarding-pass-send";

type Ctx = { params: Promise<{ id: string }> };

/** L’agence confirme, puis les cartes partent. Sans `confirm`, rien n’est envoyé. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as BoardingPassSendInput | null;
  if (!body || typeof body !== "object") return jsonError("Confirmation requise avant l’envoi.");
  const result = await sendBoardingPassWhatsapp(auth.supabase, {
    ...body,
    bookingId: id,
    staffId: auth.staff.id,
    staffUserId: auth.user.id,
  });
  if (!result.ok) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true, sent: result.sent });
}
