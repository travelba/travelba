import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { emptyToNull } from "@/lib/crm/identity";
import { persistPassportsFromForm } from "@/lib/crm/passport-import";
import { assertUpload } from "@/lib/crm/upload-policy";
import {
  applyIdentityFromForm,
  cloneTravelDocument,
  deleteTravelDocuments,
  insertTravelDocument,
  travelDocumentFromForm,
} from "@/lib/crm/travel-document-write";
import { documentActivitySummary, pieceActivityDetail, recordCustomerActivity, stayMention } from "@/lib/crm/customer-activity";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_travel_documents")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (error) return dbError(error, 500);
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
  const stay = await stayLabel(auth.supabase, auth.customer.id, bookingId);
  try {
    if (sourceId) {
      if (!bookingId) return jsonError("Réservation requise pour reprendre un document");
      const document = await cloneTravelDocument(auth.supabase, sourceId, auth.customer.id, {
        bookingId,
        travelerId,
        companionId,
      });
      await recordCustomerActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        action: "document",
        summary: documentActivitySummary("reuse", null, stay),
        bookingId,
      });
      return NextResponse.json({ document });
    }
    const file = form.get("file");
    if (file instanceof File && file.size > 0) assertUpload(file);
    const imported = await persistPassportsFromForm(auth.supabase, form, auth.customer.id, {
      first_name: auth.customer.first_name,
      last_name: auth.customer.last_name,
    });
    if (imported) {
      const added = imported.documents[0];
      await recordCustomerActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        action: "document",
        summary: documentActivitySummary("add", added?.doc_type, stay),
        detail: pieceActivityDetail(added),
        bookingId,
      });
      return NextResponse.json({
        document: imported.documents[0] || null,
        documents: imported.documents,
        created_companions: imported.createdCompanions,
      });
    }
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
    const document = await insertTravelDocument(auth.supabase, {
      ...travelDocumentFromForm(form, auth.customer.id),
      storagePath,
      fileName,
      mimeType,
    });
    await applyIdentityFromForm(auth.supabase, form, auth.customer.id, companionId, travelerId);
    await reconcileCustomerParty(auth.customer.id);
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "document",
      summary: documentActivitySummary("add", emptyToNull(form.get("doc_type")), stay),
      detail: pieceActivityDetail(document),
      bookingId,
    });
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
  const { error } = await deleteTravelDocuments(auth.supabase, {
    id,
    customer_id: auth.customer.id,
  });
  if (error) return dbError(error, 400);
  await recordCustomerActivity({
    customerId: auth.customer.id,
    authUserId: auth.user.id,
    action: "document",
    summary: documentActivitySummary("remove"),
  });
  return NextResponse.json({ ok: true });
}

async function stayLabel(
  supabase: Exclude<Awaited<ReturnType<typeof requireCustomer>>, NextResponse>["supabase"],
  customerId: string,
  bookingId: string | null
) {
  if (!bookingId) return null;
  const { data } = await supabase
    .from("crm_bookings")
    .select("reference, title, destination")
    .eq("id", bookingId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!data?.reference) return null;
  return stayMention(data.reference, data.title, data.destination);
}
