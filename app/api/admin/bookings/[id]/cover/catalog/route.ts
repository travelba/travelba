import { NextResponse } from "next/server";
import { coverQuery } from "@/lib/crm/carnet";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { unsplashKeywordMatch } from "@/lib/crm/covers";
import { toCoverJpeg, toCoverWebp, writePublicCover } from "@/lib/crm/cover-file";
import { downloadCoverImage } from "@/lib/crm/cover-search";
import { catalogCachePath, retouchCoverBytes } from "@/lib/crm/cover-retouch";
import { uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

/** Nouvelle version de la photo catalogue partagée (tous les séjours sans import). */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Réservation introuvable", 404);
  const { data: booking, error } = await auth.supabase
    .from("crm_bookings")
    .select("id, destination, title")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error, 400);
  if (!booking) return jsonError("Réservation introuvable", 404);

  const photoId = unsplashKeywordMatch(booking);
  if (!photoId) return jsonError("Pas de photo de catalogue pour ce lieu.");
  const place = coverQuery(booking.destination, booking.title);
  const remote = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1600&h=900&q=80`;
  let source: Buffer;
  try {
    source = await downloadCoverImage(remote);
  } catch (err) {
    console.error("[cover] catalog download", err instanceof Error ? err.name : "error");
    return jsonError("Photo du lieu inaccessible.", 502);
  }
  const jpeg = await toCoverJpeg(source);
  const retouched = await retouchCoverBytes(jpeg, place);
  if (!retouched) return jsonError("Retouche indisponible.", 502);
  const webp = await toCoverWebp(retouched);
  if (!webp) return jsonError("Conversion photo indisponible.", 500);
  try {
    await uploadCrmFile(catalogCachePath(photoId), webp, "image/webp", { upsert: true });
  } catch (err) {
    console.error("[cover] catalog upload", err instanceof Error ? err.name : "error");
    return jsonError("Envoi de la photo impossible.", 500);
  }
  await writePublicCover(photoId, webp);
  return NextResponse.json({ ok: true, photoId });
}
