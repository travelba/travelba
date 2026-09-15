import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { deleteCrmFile, safeFileName, uploadCrmFile, validateCrmFile, validateCrmFileMetadata } from "@/lib/crm/files";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin" && auth.staff.permissions?.finance !== true) return jsonError("Permission finance requise", 403);
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return jsonError("Justificatif requis");
  const metadataError = validateCrmFileMetadata(file);
  if (metadataError) return jsonError(metadataError);
  const bytes = Buffer.from(await file.arrayBuffer());
  const validationError = validateCrmFile(file, bytes);
  if (validationError) return jsonError(validationError);
  const { data: current } = await auth.supabase.from("crm_transactions").select("receipt_storage_path").eq("id", id).maybeSingle();
  if (!current) return jsonError("Écriture introuvable", 404);
  const path = `transactions/${id}/${Date.now()}-${safeFileName(file.name)}`;
  await uploadCrmFile(path, bytes, file.type || "application/octet-stream");
  const { data, error } = await auth.supabase.from("crm_transactions").update({ receipt_storage_path: path, receipt_file_name: file.name, receipt_mime_type: file.type || null }).eq("id", id).select("*").single();
  if (error) {
    await deleteCrmFile(path).catch(() => undefined);
    return jsonError(error.message, 400);
  }
  if (current.receipt_storage_path) await deleteCrmFile(current.receipt_storage_path).catch(() => undefined);
  return NextResponse.json({ transaction: data });
}
