import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { lireFicheHotel, validerFicheHotel } from "@/lib/crm/hotel-enrich";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type StaffAuth = Exclude<Awaited<ReturnType<typeof requireStaff>>, NextResponse>;

async function ownedHotel(auth: StaffAuth, bookingId: string, itemId: string) {
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data || data.kind !== "hotel") return null;
  return data;
}

/** Lecture de la fiche. Rien n’est envoyé. */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const itemId = new URL(request.url).searchParams.get("itemId")?.trim() || "";
  if (!itemId) return jsonError("Carte requise");
  const item = await ownedHotel(auth, id, itemId);
  if (!item) return jsonError("Carte introuvable", 404);
  const result = await lireFicheHotel(createServiceClient(), { carte_id: itemId });
  return NextResponse.json(result);
}

/** Valide la fiche. La visibilité de la carte ne change pas. Aucun message. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { itemId?: unknown; action?: unknown } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId) return jsonError("Carte requise");
  if (body?.action !== "valider") return jsonError("Action inconnue");
  const item = await ownedHotel(auth, id, itemId);
  if (!item) return jsonError("Carte introuvable", 404);
  const result = await validerFicheHotel(createServiceClient(), itemId);
  if (!result.ok) return jsonError(result.message, 404);
  return NextResponse.json(result);
}
