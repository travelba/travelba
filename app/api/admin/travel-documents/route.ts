import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { identityFieldsFromForm } from "@/lib/crm/document-identity";
import { emptyToNull } from "@/lib/crm/identity";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import {
  applyIdentityFromForm,
  cloneTravelDocument,
  insertTravelDocument,
} from "@/lib/crm/travel-document-write";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const customerId = String(form.get("customer_id") || "");
  if (!customerId) return jsonError("customer_id requis");
  const bookingId = emptyToNull(form.get("booking_id"));
  const travelerId = emptyToNull(form.get("traveler_id"));
  const sourceId = emptyToNull(form.get("source_id"));
  const companionId = emptyToNull(form.get("companion_id"));
  try {
    if (!bookingId || !travelerId) {
      return jsonError("Réservation et voyageur requis : la pièce se joint sur le dossier.");
    }
    if (sourceId) {
      if (!bookingId) return jsonError("Réservation requise pour reprendre un document");
      const document = await cloneTravelDocument(auth.supabase, sourceId, customerId, {
        bookingId,
        travelerId,
        companionId,
      });
      return NextResponse.json({ document });
    }
    const file = form.get("file");
    let storagePath: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    if (file instanceof File && file.size > 0) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const folder = bookingId
        ? `customers/${customerId}/documents/${bookingId}`
        : `customers/${customerId}/documents`;
      storagePath = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
      await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
      fileName = file.name;
      mimeType = file.type;
    }
    const identity = identityFieldsFromForm(form);
    const document = await insertTravelDocument(auth.supabase, {
      customerId,
      companionId,
      bookingId,
      travelerId,
      docType: String(form.get("doc_type") || "passport"),
      number: emptyToNull(form.get("number")),
      issuingCountry: emptyToNull(form.get("issuing_country")),
      issuedOn: emptyToNull(form.get("issued_on")),
      expiresOn: emptyToNull(form.get("expires_on")),
      storagePath,
      fileName,
      mimeType,
      ...identity,
    });
    await applyIdentityFromForm(auth.supabase, form, customerId, companionId, travelerId);
    return NextResponse.json({ document });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Enregistrement impossible", 400);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { error } = await auth.supabase.from("crm_travel_documents").delete().eq("id", id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
