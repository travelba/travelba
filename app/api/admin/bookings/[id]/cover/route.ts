import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { downloadCoverImage, isCoverPhotoId, loadCoverPhoto } from "@/lib/crm/cover-search";
import { uploadCrmFile } from "@/lib/crm/files";
import { isUuid } from "@/lib/crm/ids";
import { trySharp } from "@/lib/crm/sharp";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isCoverImage(file: File) {
  if (TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

async function toCoverWebp(bytes: Buffer) {
  const sharp = await trySharp();
  if (!sharp) return null;
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 900, fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}

export async function POST(request: Request, ctx: Ctx) {
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

  const contentType = request.headers.get("content-type") || "";
  let bytes: Buffer;
  let credit: string | null = null;
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { photoId?: unknown } | null;
    const photoId = typeof body?.photoId === "string" ? body.photoId : "";
    if (!isCoverPhotoId(photoId)) return jsonError("Photo introuvable.");
    let remote: Awaited<ReturnType<typeof loadCoverPhoto>>;
    try {
      remote = await loadCoverPhoto(photoId);
    } catch (err) {
      console.error("[cover] search", err);
      return jsonError("Photo introuvable.", 502);
    }
    if (!remote) return jsonError("Photo introuvable.", 404);
    try {
      bytes = await downloadCoverImage(remote.url);
    } catch (err) {
      console.error("[cover] download", err);
      const tooBig = err instanceof Error && err.message === "size";
      return jsonError(tooBig ? "Photo trop lourde." : "Photo inaccessible.", 502);
    }
    credit = remote.credit;
  } else {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Fichier requis");
    if (!isCoverImage(file)) return jsonError("Formats acceptés : JPEG, PNG ou WebP.");
    if (file.size > MAX_BYTES) return jsonError("Photo trop lourde (8 Mo maximum).");
    bytes = Buffer.from(await file.arrayBuffer());
  }

  let webp: Buffer | null;
  try {
    webp = await toCoverWebp(bytes);
  } catch {
    return jsonError("Photo illisible.", 400);
  }
  if (!webp) return jsonError("Conversion photo indisponible.", 500);

  const path = `bookings/${id}/cover.webp`;
  try {
    await uploadCrmFile(path, webp, "image/webp", { upsert: true });
  } catch (err) {
    console.error("[cover] upload", err);
    return jsonError("Envoi de la photo impossible.", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .update({ cover_image_path: path, cover_credit: credit })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ booking: data });
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
