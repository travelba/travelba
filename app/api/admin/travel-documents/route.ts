import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  deleteCrmFile,
  safeFileName,
  uploadCrmFile,
  validateCrmFile,
  validateCrmFileMetadata,
} from "@/lib/crm/files";

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
    const metadataError = validateCrmFileMetadata(file);
    if (metadataError) return jsonError(metadataError, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const validationError = validateCrmFile(file, bytes);
    if (validationError) return jsonError(validationError, 400);
    storagePath = `customers/${customerId}/documents/${Date.now()}-${safeFileName(file.name)}`;
    await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
    fileName = file.name;
    mimeType = file.type;
  }
  const companionId = form.get("companion_id")
    ? String(form.get("companion_id"))
    : null;
  if (companionId) {
    const { data: companion } = await auth.supabase
      .from("crm_travel_companions")
      .select("id")
      .eq("id", companionId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!companion) {
      if (storagePath) await deleteCrmFile(storagePath).catch(() => undefined);
      return jsonError("Le compagnon n’appartient pas à ce client.");
    }
  }
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .insert({
      customer_id: customerId,
      companion_id: companionId,
      doc_type: form.get("doc_type") || "passport",
      number: form.get("number") || null,
      issuing_country: form.get("issuing_country") || null,
      issued_on: form.get("issued_on") || null,
      expires_on: form.get("expires_on") || null,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
    })
    .select("*")
    .single();
  if (error) {
    if (storagePath) await deleteCrmFile(storagePath).catch(() => undefined);
    return jsonError(error.message, 400);
  }
  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Corps de requête invalide");
  }
  const id = String(body?.id || "");
  const customerId = String(body?.customer_id || "");
  if (!id || !customerId) return jsonError("id et customer_id requis");
  const patch: Record<string, unknown> = {};
  for (const key of [
    "companion_id",
    "doc_type",
    "number",
    "issuing_country",
    "issued_on",
    "expires_on",
  ]) {
    if (key in body) patch[key] = body[key] || null;
  }
  if (!Object.keys(patch).length) return jsonError("Aucune modification");
  if (patch.companion_id) {
    const { data: companion } = await auth.supabase
      .from("crm_travel_companions")
      .select("id")
      .eq("id", String(patch.companion_id))
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!companion) return jsonError("Le compagnon n’appartient pas à ce client.");
  }
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .update(patch)
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const customerId = url.searchParams.get("customerId");
  if (!id) return jsonError("id requis");
  let lookup = auth.supabase
    .from("crm_travel_documents")
    .select("storage_path")
    .eq("id", id);
  if (customerId) lookup = lookup.eq("customer_id", customerId);
  const { data: document } = await lookup.maybeSingle();
  if (!document) return jsonError("Document introuvable", 404);
  let deletion = auth.supabase
    .from("crm_travel_documents")
    .delete()
    .eq("id", id);
  if (customerId) deletion = deletion.eq("customer_id", customerId);
  const { error } = await deletion;
  if (error) return jsonError(error.message, 400);
  if (document.storage_path) {
    await deleteCrmFile(document.storage_path).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
