import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { emptyToNull } from "@/lib/crm/identity";
import {
  applyIdentityFromForm,
  cloneTravelDocument,
  insertTravelDocument,
} from "@/lib/crm/travel-document-write";

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
  const bookingId = emptyToNull(form.get("booking_id"));
  const travelerId = emptyToNull(form.get("traveler_id"));
  const sourceId = emptyToNull(form.get("source_id"));
  const companionId = emptyToNull(form.get("companion_id"));
  try {
    if (!bookingId || !travelerId) {
      return jsonError("Réservation et voyageur requis : joignez la pièce depuis le dossier voyage.");
    }
    if (sourceId) {
      if (!bookingId) return jsonError("Réservation requise pour reprendre un document");
      const document = await cloneTravelDocument(auth.supabase, sourceId, auth.customer.id, {
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
        ? `customers/${auth.customer.id}/documents/${bookingId}`
        : `customers/${auth.customer.id}/documents`;
      storagePath = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
      await uploadCrmFile(storagePath, bytes, file.type || "application/octet-stream");
      fileName = file.name;
      mimeType = file.type;
    }
    const document = await insertTravelDocument(auth.supabase, {
      customerId: auth.customer.id,
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
    });
    await applyIdentityFromForm(auth.supabase, form, auth.customer.id, companionId, travelerId);
    return NextResponse.json({ document });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Enregistrement impossible", 400);
  }
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
