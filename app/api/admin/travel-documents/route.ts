import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { emptyToNull } from "@/lib/crm/identity";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import {
  applyIdentityFromForm,
  cloneTravelDocument,
  deleteTravelDocuments,
  insertTravelDocument,
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
    const document = await insertTravelDocument(auth.supabase, {
      ...travelDocumentFromForm(form, customerId),
      storagePath,
      fileName,
      mimeType,
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
  const { error } = await deleteTravelDocuments(auth.supabase, { id });
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
