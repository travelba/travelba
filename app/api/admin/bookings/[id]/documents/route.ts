import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { attachBookingDocument, bookingDocumentKind, removeBookingDocument } from "@/lib/crm/booking-document-write";
import { queuePublishedPieces, safeConcierge } from "@/lib/crm/concierge-send";
import { normalizePieceKind } from "@/lib/crm/concierge-notices";
import { syncCheckinWithPasses } from "@/lib/crm/online-checkin-db";
import { uploadIssue } from "@/lib/crm/upload-policy";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const issue = uploadIssue(file, "dossier");
  if (issue) return jsonError(issue, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const saved = await attachBookingDocument(auth.supabase, {
    bookingId: id,
    itemId: String(form.get("booking_item_id") || ""),
    kind: String(form.get("kind") || "other"),
    file: { name: file.name, type: file.type, size: file.size, bytes },
  });
  if ("error" in saved) return jsonError(saved.error, saved.status);
  return NextResponse.json({ document: saved.document });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const docId = String(body?.id || "");
  if (!docId) return jsonError("id requis");
  const update: { visible_to_client?: boolean; kind?: string } = {};
  if (body && Object.prototype.hasOwnProperty.call(body, "visible_to_client")) {
    update.visible_to_client = Boolean(body.visible_to_client);
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "kind")) {
    const kind = bookingDocumentKind(String(body.kind || ""));
    if (kind !== "carte d'embarquement" && kind !== "other") return jsonError("Type de pièce invalide.");
    update.kind = kind;
  }
  if (!Object.keys(update).length) return jsonError("Rien à modifier.");
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .update(update)
    .eq("id", docId)
    .eq("booking_id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const doc = data as { id: string; kind: string; booking_item_id?: string | null; visible_to_client?: boolean };
  if (doc.kind === "carte d'embarquement") await syncCheckinWithPasses(auth.supabase, id, "agence");
  if (doc.visible_to_client) {
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("visible_to_client")
      .eq("id", id)
      .maybeSingle();
    if (booking?.visible_to_client) {
      let itemKind: string | null = null;
      if (doc.booking_item_id) {
        const { data: item } = await auth.supabase
          .from("crm_booking_items")
          .select("kind")
          .eq("id", doc.booking_item_id)
          .maybeSingle();
        itemKind = (item?.kind as string | undefined) || null;
      }
      const kind = normalizePieceKind(itemKind) || normalizePieceKind(doc.kind);
      if (kind) await safeConcierge(() => queuePublishedPieces(id, [{ id: doc.id, kind }]));
    }
  }
  return NextResponse.json({ document: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const docId = new URL(request.url).searchParams.get("id") || "";
  if (!docId) return jsonError("id requis");
  const removed = await removeBookingDocument(auth.supabase, id, docId);
  if ("error" in removed) return jsonError(removed.error, removed.status);
  return NextResponse.json({ ok: true });
}
