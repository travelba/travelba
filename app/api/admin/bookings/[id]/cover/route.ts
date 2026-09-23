import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
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

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  if (!isCoverImage(file)) return jsonError("Formats acceptés : JPEG, PNG ou WebP.");
  if (file.size > MAX_BYTES) return jsonError("Photo trop lourde (8 Mo maximum).");

  const sharp = await trySharp();
  if (!sharp) return jsonError("Conversion photo indisponible.", 500);
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" })
      .rotate()
      .resize({ width: 1600, height: 900, fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return jsonError("Photo illisible.", 400);
  }

  const path = `bookings/${id}/cover.webp`;
  try {
    await uploadCrmFile(path, webp, "image/webp", { upsert: true });
  } catch (err) {
    console.error("[cover] upload", err);
    return jsonError("Envoi de la photo impossible.", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .update({ cover_image_path: path })
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
    .update({ cover_image_path: null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  if (!data) return jsonError("Réservation introuvable", 404);
  return NextResponse.json({ booking: data });
}
