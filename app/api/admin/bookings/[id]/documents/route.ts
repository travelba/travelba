import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const kind = String(form.get("kind") || "other");
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `bookings/${id}/${Date.now()}-${safeFileName(file.name)}`;
  await uploadCrmFile(path, bytes, file.type || "application/octet-stream");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: id,
      kind,
      file_name: file.name,
      mime_type: file.type,
      storage_path: path,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  await ctx.params;
  const body = await request.json().catch(() => null);
  const docId = String(body?.id || "");
  if (!docId) return jsonError("id requis");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .update({ visible_to_client: Boolean(body?.visible_to_client) })
    .eq("id", docId)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ document: data });
}
