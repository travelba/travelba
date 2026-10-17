import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { emptyToNull } from "@/lib/crm/identity";
import { persistPassportsFromForm } from "@/lib/crm/passport-import";
import { assertUpload } from "@/lib/crm/upload-policy";
import {
  applyIdentityFromForm,
  cloneTravelDocument,
  deleteTravelDocuments,
  insertTravelDocument,
  saveUploadedTravelDocument,
  travelDocumentFromForm,
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
    if (file instanceof File && file.size > 0) assertUpload(file);
    const imported = await persistPassportsFromForm(auth.supabase, form, customerId);
    if (imported) {
      return NextResponse.json({
        document: imported.documents[0] || null,
        documents: imported.documents,
        created_companions: imported.createdCompanions,
      });
    }
    const document =
      file instanceof File && file.size > 0
        ? await saveUploadedTravelDocument(auth.supabase, travelDocumentFromForm(form, customerId), {
            name: file.name,
            type: file.type,
            bytes: new Uint8Array(await file.arrayBuffer()),
          })
        : await insertTravelDocument(auth.supabase, travelDocumentFromForm(form, customerId));
    await applyIdentityFromForm(auth.supabase, form, customerId, companionId, travelerId);
    await reconcileCustomerParty(customerId);
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
  const { error } = await deleteTravelDocuments(auth.supabase, { id });
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
