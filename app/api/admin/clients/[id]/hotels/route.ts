import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { reviewHotelAccess, writeHotelAccess } from "@/lib/crm/hotel-access-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; live?: unknown; request?: unknown } | null;
  const { data } = await createServiceClient()
    .from("crm_customers")
    .select("id, hotel_demo")
    .eq("id", id)
    .maybeSingle();
  if (!data) return jsonError("Client introuvable", 404);
  const demo = (data as { hotel_demo?: boolean }).hotel_demo === true;
  const staffId = auth.staff.id;
  try {
    if (body?.request === "accept" || body?.request === "refuse") {
      const reviewed = await reviewHotelAccess({
        actor: "admin",
        staffId,
        customerId: id,
        decision: body.request,
      });
      if (!reviewed.ok) return jsonError(reviewed.error, 400);
      return NextResponse.json({ ok: true });
    }
    if (typeof body?.enabled !== "boolean") return jsonError("Indiquez l’accès.", 400);
    const saved = await writeHotelAccess({
      actor: "admin",
      staffId,
      customerId: id,
      enabled: body.enabled,
      demo,
      live: body.live === true,
    });
    if (!saved.ok) return jsonError(saved.error, 400);
    return NextResponse.json({ ok: true, enabled: saved.enabled, live: saved.live });
  } catch {
    return jsonError("L’accès n’a pas été enregistré.", 500);
  }
}
