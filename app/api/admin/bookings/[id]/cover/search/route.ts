import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { normalizeCoverSearchQuery, searchCoverPhotos } from "@/lib/crm/cover-search";
import { isUuid } from "@/lib/crm/ids";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Réservation introuvable", 404);
  const { data: existing } = await auth.supabase
    .from("crm_bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return jsonError("Réservation introuvable", 404);

  const query = normalizeCoverSearchQuery(new URL(request.url).searchParams.get("q") || "");
  if (!query) return jsonError("Indiquez une ville.");
  try {
    const photos = await searchCoverPhotos(query);
    return NextResponse.json({ photos });
  } catch (err) {
    console.error("[cover] search", err);
    const message = err instanceof Error && err.name === "CoverSearchError" ? err.message : "Recherche photo impossible.";
    return jsonError(message, 502);
  }
}
