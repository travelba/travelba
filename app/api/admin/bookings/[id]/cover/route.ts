import { NextResponse } from "next/server";
import { coverQuery } from "@/lib/crm/carnet";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { coverSourceId, toCoverWebp } from "@/lib/crm/cover-file";
import { downloadCoverImage, isCoverPhotoId, loadCoverPhoto } from "@/lib/crm/cover-search";
import { retouchCachePath, retouchCoverBytes } from "@/lib/crm/cover-retouch";
import { downloadCrmFile, uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isCoverImage(file: File) {
  if (TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Réservation introuvable", 404);
  const { data: existing } = await auth.supabase
    .from("crm_bookings")
    .select("id, destination, title, cover_image_path")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return jsonError("Réservation introuvable", 404);

  const place = coverQuery(existing.destination, existing.title);
  const contentType = request.headers.get("content-type") || "";
  let bytes: Buffer | null = null;
  let sourceId: string | null = null;
  let regenerate = false;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      photoId?: unknown;
      regenerate?: unknown;
    } | null;
    regenerate = body?.regenerate === true;
    const photoId = typeof body?.photoId === "string" ? body.photoId : "";
    if (photoId) {
      if (!isCoverPhotoId(photoId)) return jsonError("Photo introuvable.");
      sourceId = photoId;
      let remote: Awaited<ReturnType<typeof loadCoverPhoto>>;
      try {
        remote = await loadCoverPhoto(photoId);
      } catch (err) {
        console.error("[cover] search", err instanceof Error ? err.name : "error");
        return jsonError("Photo introuvable.", 502);
      }
      if (!remote) return jsonError("Photo introuvable.", 404);
      try {
        bytes = await downloadCoverImage(remote.url);
      } catch (err) {
        console.error("[cover] download", err instanceof Error ? err.name : "error");
        const tooBig = err instanceof Error && err.message === "size";
        return jsonError(tooBig ? "Photo trop lourde." : "Photo inaccessible.", 502);
      }
    } else if (regenerate && existing.cover_image_path) {
      try {
        const current = await downloadCrmFile(existing.cover_image_path);
        bytes = Buffer.from(current.bytes);
        sourceId = `booking-${id}`;
      } catch (err) {
        console.error("[cover] reread", err instanceof Error ? err.name : "error");
        return jsonError("Photo inaccessible.", 502);
      }
    } else {
      return jsonError("Photo requise");
    }
  } else {
    const form = await request.formData();
    regenerate = form.get("regenerate") === "1";
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Fichier requis");
    if (!isCoverImage(file)) return jsonError("Formats acceptés : JPEG, PNG ou WebP.");
    if (file.size > MAX_BYTES) return jsonError("Photo trop lourde (8 Mo maximum).");
    bytes = Buffer.from(await file.arrayBuffer());
    sourceId = coverSourceId(bytes);
  }

  let webp: Buffer | null = null;
  let retouched = false;
  if (sourceId && !regenerate) {
    try {
      const cached = await downloadCrmFile(retouchCachePath(sourceId));
      webp = Buffer.from(cached.bytes);
      retouched = true;
    } catch {
      webp = null;
    }
  }
  if (!webp && bytes) {
    const out = await retouchCoverBytes(bytes, place);
    if (out) {
      webp = await toCoverWebp(out);
      retouched = Boolean(webp);
      if (webp && sourceId) {
        try {
          await uploadCrmFile(retouchCachePath(sourceId), webp, "image/webp", { upsert: true });
        } catch (err) {
          console.error("[cover] cache", err instanceof Error ? err.name : "error");
        }
      }
    }
  }
  if (!webp && bytes) {
    try {
      webp = await toCoverWebp(bytes);
    } catch {
      return jsonError("Photo illisible.", 400);
    }
    retouched = false;
  }
  if (!webp) return jsonError("Conversion photo indisponible.", 500);

  const path = `bookings/${id}/cover.webp`;
  try {
    await uploadCrmFile(path, webp, "image/webp", { upsert: true });
  } catch (err) {
    console.error("[cover] upload", err instanceof Error ? err.name : "error");
    return jsonError("Envoi de la photo impossible.", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .update({ cover_image_path: path, cover_credit: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ booking: data, retouched });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Réservation introuvable", 404);
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .update({ cover_image_path: null, cover_credit: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  if (!data) return jsonError("Réservation introuvable", 404);
  return NextResponse.json({ booking: data });
}
