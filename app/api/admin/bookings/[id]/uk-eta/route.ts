import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { readUkEtaLines, sendUkEtaToClient, syncUkEtaForBookingId } from "@/lib/crm/uk-eta-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const lines = await readUkEtaLines(createServiceClient(), id);
    return NextResponse.json({ ok: true, lines });
  } catch {
    return jsonError("ETA indisponible", 503);
  }
}

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
      const lines = await syncUkEtaForBookingId(admin, id, { travelerId, stamp: new Date().toISOString() });
      const line = lines.find((row) => row.travelerId === travelerId);
      if (!line?.canVerify) return jsonError("Ce voyageur n’est pas soumis à l’ETA.");
      return NextResponse.json({ ok: true, lines });
    }
    const result = await sendUkEtaToClient(admin, id, travelerId);
    if (!result.ok) return jsonError(result.error);
    const lines = await readUkEtaLines(admin, id);
    return NextResponse.json({ ok: true, lines });
  } catch {
    return jsonError("ETA indisponible", 503);
  }
}
