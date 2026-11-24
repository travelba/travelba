import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireStaff } from "@/lib/crm/auth";
import { hotelAutoSettingsPatch } from "@/lib/crm/hotel-auto";
import { markAutonomousSeen, saveHotelAutoSettings } from "@/lib/crm/hotel-auto-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    source?: unknown;
    id?: unknown;
    payRequest?: unknown;
    chargeEnabled?: unknown;
    maxEuros?: unknown;
  } | null;
  if (body?.action === "vu") {
    const auth = await requireStaff();
    if (auth instanceof NextResponse) return auth;
    const source = body.source === "job" || body.source === "notice" ? body.source : null;
    const id = typeof body.id === "string" ? body.id : "";
    if (!source || !id) return jsonError("Ligne introuvable.", 400);
    const ok = await markAutonomousSeen(createServiceClient(), source, id);
    if (!ok) return jsonError("Le marquage n’a pas abouti.", 400);
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "reglages") {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;
    const parsed = hotelAutoSettingsPatch({
      payRequest: body.payRequest === true,
      chargeEnabled: body.chargeEnabled === true,
      maxEuros: typeof body.maxEuros === "number" ? body.maxEuros : Number.NaN,
    });
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const saved = await saveHotelAutoSettings(createServiceClient(), {
      payRequest: parsed.row.auto_hotel_pay_request,
      chargeEnabled: parsed.row.auto_hotel_charge_enabled,
      chargeMaxCents: parsed.row.auto_hotel_charge_max_cents,
      staffId: auth.staff.id,
    });
    if (!saved.ok) return jsonError(saved.error, 400);
    return NextResponse.json({ ok: true });
  }
  return jsonError("Action inconnue.", 400);
}
