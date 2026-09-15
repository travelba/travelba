import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import {
  deleteCrmFile,
  safeFileName,
  uploadCrmFile,
  validateCrmFile,
  validateCrmFileMetadata,
} from "@/lib/crm/files";
import { DOC_TYPES, type TravelDocType } from "@/lib/crm/types";

function parseDocumentType(value: FormDataEntryValue | null) {
  const type = String(value || "passport");
  return DOC_TYPES.includes(type as TravelDocType) ? (type as TravelDocType) : null;
}

async function validateCompanion(
  companionId: string | null,
  customerId: string,
  supabase: SupabaseClient
) {
  if (!companionId) return true;
  const { data } = await supabase
    .from("crm_travel_companions")
    .select("id")
    .eq("id", companionId)
    .eq("customer_id", customerId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ documents: data });
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
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
    storagePath = `customers/${auth.customer.id}/documents/${Date.now()}-${safeFileName(file.name)}`;
    try {
      await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
    } catch {
      return jsonError("Le fichier n’a pas pu être envoyé.", 500);
    }
    fileName = file.name;
    mimeType = file.type;
  }
  const docType = parseDocumentType(form.get("doc_type"));
  if (!docType) {
    if (storagePath) await deleteCrmFile(storagePath).catch(() => undefined);
    return jsonError("Type de document invalide.", 400);
  }
  const companionId = form.get("companion_id")
    ? String(form.get("companion_id"))
    : null;
  if (!(await validateCompanion(companionId, auth.customer.id, auth.supabase))) {
    if (storagePath) await deleteCrmFile(storagePath).catch(() => undefined);
    return jsonError("Compagnon invalide.");
  }
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .insert({
      customer_id: auth.customer.id,
      companion_id: companionId,
      doc_type: docType,
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
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const id = String(form.get("id") || "");
  if (!id) return jsonError("id requis");

  const { data: existing } = await auth.supabase
    .from("crm_travel_documents")
    .select("*")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!existing) return jsonError("Document introuvable", 404);

  const docType = parseDocumentType(form.get("doc_type"));
  if (!docType) return jsonError("Type de document invalide.", 400);
  const companionId = form.get("companion_id")
    ? String(form.get("companion_id"))
    : null;
  if (!(await validateCompanion(companionId, auth.customer.id, auth.supabase))) {
    return jsonError("Compagnon invalide.", 400);
  }

  const file = form.get("file");
  let newStoragePath: string | null = null;
  let fileName = existing.file_name;
  let mimeType = existing.mime_type;
  if (file instanceof File && file.size > 0) {
    const metadataError = validateCrmFileMetadata(file);
    if (metadataError) return jsonError(metadataError, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const validationError = validateCrmFile(file, bytes);
    if (validationError) return jsonError(validationError, 400);
    newStoragePath = `customers/${auth.customer.id}/documents/${Date.now()}-${safeFileName(file.name)}`;
    try {
      await uploadCrmFile(
        newStoragePath,
        bytes,
        file.type || "application/octet-stream"
      );
    } catch {
      return jsonError("Le fichier de remplacement n’a pas pu être envoyé.", 500);
    }
    fileName = file.name;
    mimeType = file.type;
  }

  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .update({
      companion_id: companionId,
      doc_type: docType,
      number: form.get("number") || null,
      issuing_country: form.get("issuing_country") || null,
      issued_on: form.get("issued_on") || null,
      expires_on: form.get("expires_on") || null,
      storage_path: newStoragePath || existing.storage_path,
      file_name: fileName,
      mime_type: mimeType,
    })
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    if (newStoragePath) await deleteCrmFile(newStoragePath).catch(() => undefined);
    return jsonError(error?.message || "Document introuvable", error ? 400 : 404);
  }
  if (
    newStoragePath &&
    existing.storage_path &&
    existing.storage_path !== newStoragePath
  ) {
    await deleteCrmFile(existing.storage_path).catch(() => undefined);
  }
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { data: document } = await auth.supabase
    .from("crm_travel_documents")
    .select("storage_path")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!document) return jsonError("Document introuvable", 404);
  const { error } = await auth.supabase
    .from("crm_travel_documents")
    .delete()
    .eq("id", id)
    .eq("customer_id", auth.customer.id);
  if (error) return jsonError(error.message, 400);
  if (document.storage_path) {
    await deleteCrmFile(document.storage_path).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
