import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { enrichHotelItem } from "@/lib/crm/hotel-web-run";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Relance la recherche pour une carte hôtel. La visibilité ne change pas. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) return jsonError("Carte requise");
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind")
    .eq("id", itemId)
    .eq("booking_id", id)
    .maybeSingle();
  if (error) return jsonError("Carte introuvable", 400);
  if (!data) return jsonError("Carte introuvable", 404);
  if (data.kind !== "hotel") return jsonError("Ce n’est pas une carte hôtel");
  try {
    const result = await enrichHotelItem(itemId, { force: true });
    return NextResponse.json(result);
  } catch (err) {
    console.warn("[hotel-web]", err instanceof Error ? err.message : "echec");
    return jsonError("Recherche impossible", 500);
  }
}
