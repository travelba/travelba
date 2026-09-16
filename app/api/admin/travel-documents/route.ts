import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { resolveCountryCode } from "@/lib/crm/countries";
import { emptyToNull } from "@/lib/crm/identity";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const customerId = String(form.get("customer_id") || "");
  if (!customerId) return jsonError("customer_id requis");
  const file = form.get("file");
  let storagePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    storagePath = `customers/${customerId}/documents/${Date.now()}-${safeFileName(file.name)}`;
    await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
    fileName = file.name;
    mimeType = file.type;
  }
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .insert({
      customer_id: customerId,
      companion_id: emptyToNull(form.get("companion_id")),
      doc_type: form.get("doc_type") || "passport",
      number: emptyToNull(form.get("number")),
      issuing_country:
        resolveCountryCode(String(form.get("issuing_country") || "")) ||
        emptyToNull(form.get("issuing_country")),
      issued_on: emptyToNull(form.get("issued_on")),
      expires_on: emptyToNull(form.get("expires_on")),
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { error } = await auth.supabase
    .from("crm_travel_documents")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
