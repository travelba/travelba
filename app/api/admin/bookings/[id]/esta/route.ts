import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { loadEstaForBookingId, sendEstaToClient, syncEstaForBookingId } from "@/lib/crm/esta-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function linesResponse(lines: unknown) {
  return NextResponse.json({ ok: true, lines }, { headers: { "Cache-Control": "no-store" } });
}

/** Lecture des badges. Ne déclenche pas le webhook. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const lines = await loadEstaForBookingId(createServiceClient(), id);
    return linesResponse(lines);
  } catch {
    return jsonError("ESTA indisponible", 503);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const travelerId = String(body?.travelerId || "");
  const action = body?.action === "send" || body?.action === "verify" || body?.action === "resend" ? body.action : null;
  if (!travelerId || !action) return jsonError("Action inconnue");
  try {
    const admin = createServiceClient();
    if (action === "verify") {
      const lines = await syncEstaForBookingId(admin, id, { travelerId, stamp: new Date().toISOString() });
      const line = lines.find((row) => row.travelerId === travelerId);
      if (!line?.canVerify) return jsonError("Ce voyageur n’est pas soumis à l’ESTA.");
      return linesResponse(lines);
    }
    const result = await sendEstaToClient(admin, id, travelerId, { again: action === "resend" });
    if (!result.ok) return jsonError(result.error);
    return linesResponse(await loadEstaForBookingId(admin, id));
  } catch {
    return jsonError("ESTA indisponible", 503);
  }
}
