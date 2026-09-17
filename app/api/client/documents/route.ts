import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { resolveCountryCode } from "@/lib/crm/countries";
import { filledIdentity, identityFieldsFromForm } from "@/lib/crm/document-identity";
import { emptyToNull } from "@/lib/crm/identity";
import { DOC_TYPES, type TravelDocType } from "@/lib/crm/types";

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
    const bytes = Buffer.from(await file.arrayBuffer());
    storagePath = `customers/${auth.customer.id}/documents/${Date.now()}-${safeFileName(file.name)}`;
    await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
    fileName = file.name;
    mimeType = file.type;
  }
  const docTypeRaw = String(form.get("doc_type") || "passport");
  const docType = (DOC_TYPES as readonly string[]).includes(docTypeRaw)
    ? (docTypeRaw as TravelDocType)
    : "passport";
  const companionId = emptyToNull(form.get("companion_id"));
  const identity = identityFieldsFromForm(form);
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .insert({
      customer_id: auth.customer.id,
      companion_id: companionId,
      doc_type: docType,
      number: emptyToNull(form.get("number")),
      issuing_country:
        resolveCountryCode(String(form.get("issuing_country") || "")) ||
        emptyToNull(form.get("issuing_country")),
      issued_on: emptyToNull(form.get("issued_on")),
      expires_on: emptyToNull(form.get("expires_on")),
      ...identity,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);

  if (String(form.get("apply_identity") || "") === "1") {
    const filled = filledIdentity(identity);
    if (Object.keys(filled).length > 0) {
      if (companionId) {
        await auth.supabase
          .from("crm_travel_companions")
          .update(filled)
          .eq("id", companionId)
          .eq("customer_id", auth.customer.id);
      } else {
        await auth.supabase.from("crm_customers").update(filled).eq("id", auth.customer.id);
      }
    }
  }

  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { error } = await auth.supabase
    .from("crm_travel_documents")
    .delete()
    .eq("id", id)
    .eq("customer_id", auth.customer.id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
