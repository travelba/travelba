import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { sendEstaToClient, syncEstaForBookingId } from "@/lib/crm/esta-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const travelerId = String(body?.travelerId || "");
  const action = body?.action === "send" || body?.action === "verify" ? body.action : null;
  if (!travelerId || !action) return jsonError("Action inconnue");
  try {
    const admin = createServiceClient();
    if (action === "verify") {
      const lines = await syncEstaForBookingId(admin, id, { travelerId, stamp: new Date().toISOString() });
      const line = lines.find((row) => row.travelerId === travelerId);
      if (!line?.canVerify) return jsonError("Ce voyageur n’est pas soumis à l’ESTA.");
      return NextResponse.json({ ok: true });
    }
    const result = await sendEstaToClient(admin, id, travelerId);
    if (!result.ok) return jsonError(result.error);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError("ESTA indisponible", 503);
  }
}
