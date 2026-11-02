import { NextResponse } from "next/server";
import { publicHttpsUrl } from "@/lib/crm/restaurant-media";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lien court de la fiche salle. Redirige vers le site ou la page Google du catalogue. */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  try {
    const db = createServiceClient();
    const found = await db.from("crm_restaurants").select("place_url, website").eq("id", id).maybeSingle();
    const row = found.data as { place_url?: string | null; website?: string | null } | null;
    const target = publicHttpsUrl(row?.place_url || "") || publicHttpsUrl(row?.website || "");
    if (!target) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
