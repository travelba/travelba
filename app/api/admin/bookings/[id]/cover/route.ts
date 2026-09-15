import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { deleteCrmFile, safeFileName, uploadCrmFile, validateCrmFile, validateCrmFileMetadata } from "@/lib/crm/files";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return jsonError("Image requise");
  if (!file.type.startsWith("image/")) return jsonError("La couverture doit être une image");
  const metadataError = validateCrmFileMetadata(file);
  if (metadataError) return jsonError(metadataError);
  const bytes = Buffer.from(await file.arrayBuffer());
  const validationError = validateCrmFile(file, bytes);
  if (validationError) return jsonError(validationError);
  const { data: booking } = await auth.supabase.from("crm_bookings").select("cover_image_path").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  const path = `bookings/${id}/cover/${Date.now()}-${safeFileName(file.name)}`;
  try {
    await uploadCrmFile(path, bytes, file.type);
    const { data, error } = await auth.supabase.from("crm_bookings").update({ cover_image_path: path }).eq("id", id).select("*").single();
    if (error) {
      await deleteCrmFile(path).catch(() => undefined);
      return jsonError(error.message, 400);
    }
    if (booking.cover_image_path) await deleteCrmFile(booking.cover_image_path).catch(() => undefined);
    return NextResponse.json({ booking: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload impossible", 500);
  }
}
