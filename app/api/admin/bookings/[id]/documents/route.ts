import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { publishRevealIds } from "@/lib/crm/carnet";
import { queuePublishedPieces, safeConcierge } from "@/lib/crm/concierge-send";
import { normalizePieceKind } from "@/lib/crm/concierge-notices";
import { hiddenPricePath, hiddenPricePathFromStorage } from "@/lib/crm/document-price";
import { removeCrmFiles, safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { HIDE_PRICE_REQUIRED, PriceRedactError, readHidePricesChoice } from "@/lib/crm/pdf-price-redact";

type Ctx = { params: Promise<{ id: string }> };

function redactError(err: unknown) {
  if (err instanceof PriceRedactError) return jsonError(err.message, 400);
  return null;
}

async function visibleOncePublished(
  supabase: SupabaseClient,
  bookingId: string,
  itemId: string | null
) {
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("visible_to_client")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking?.visible_to_client) return false;
  if (!itemId) return true;
  const { data: item } = await supabase
    .from("crm_booking_items")
    .select("id, kind, details")
    .eq("id", itemId)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!item) return false;
  return publishRevealIds([item as { id: string; kind: string; details?: Record<string, unknown> | null }]).includes(
    item.id
  );
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const hidePrices = readHidePricesChoice(form.get("hide_prices"));
  if (hidePrices === undefined) return jsonError(HIDE_PRICE_REQUIRED);
  const kind = String(form.get("kind") || "other");
  const itemId = String(form.get("booking_item_id") || "").trim() || null;
  if (itemId) {
    const { data: item } = await auth.supabase
      .from("crm_booking_items")
      .select("id")
      .eq("id", itemId)
      .eq("booking_id", id)
      .maybeSingle();
    if (!item) return jsonError("Carte introuvable");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  let clientPath: string | null = null;
  try {
    if (hidePrices) {
      clientPath = await hiddenPricePath({ bytes, mime, name: file.name, bookingId: id });
    }
  } catch (err) {
    const refused = redactError(err);
    if (refused) return refused;
    throw err;
  }
  const path = `bookings/${id}/${Date.now()}-${safeFileName(file.name)}`;
  await uploadCrmFile(path, Buffer.from(bytes), mime);
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .insert({
      booking_id: id,
      booking_item_id: itemId,
      kind,
      file_name: file.name,
      mime_type: file.type,
      storage_path: path,
      client_storage_path: clientPath,
      hide_prices: hidePrices,
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ document: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const docId = String(body?.id || "");
  if (!docId) return jsonError("id requis");
  if (body && Object.prototype.hasOwnProperty.call(body, "hide_prices")) {
    const hidePrices = readHidePricesChoice(body.hide_prices);
    if (hidePrices === undefined) return jsonError(HIDE_PRICE_REQUIRED);
    const { data: current, error: readError } = await auth.supabase
      .from("crm_booking_documents")
      .select("id, storage_path, client_storage_path, file_name, mime_type, kind, booking_item_id")
      .eq("id", docId)
      .eq("booking_id", id)
      .maybeSingle();
    if (readError) return dbError(readError, 400);
    if (!current?.storage_path) return jsonError("Pièce introuvable", 404);
    let clientPath: string | null = null;
    try {
      if (hidePrices) {
        clientPath = await hiddenPricePathFromStorage({
          storagePath: current.storage_path,
          mime: current.mime_type,
          name: current.file_name || "document.pdf",
          bookingId: id,
        });
      }
    } catch (err) {
      const refused = redactError(err);
      if (refused) return refused;
      throw err;
    }
    const visible = await visibleOncePublished(auth.supabase, id, current.booking_item_id || null);
    const { data, error } = await auth.supabase
      .from("crm_booking_documents")
      .update({
        hide_prices: hidePrices,
        client_storage_path: clientPath,
        visible_to_client: visible,
      })
      .eq("id", docId)
      .eq("booking_id", id)
      .select("*")
      .single();
    if (error) return dbError(error, 400);
    if (current.client_storage_path && current.client_storage_path !== clientPath) {
      await removeCrmFiles([current.client_storage_path]);
    }
    if (visible) {
      let itemKind: string | null = null;
      if (current.booking_item_id) {
        const { data: item } = await auth.supabase
          .from("crm_booking_items")
          .select("kind")
          .eq("id", current.booking_item_id)
          .maybeSingle();
        itemKind = (item?.kind as string | undefined) || null;
      }
      const kind = normalizePieceKind(itemKind) || normalizePieceKind(current.kind);
      if (kind) await safeConcierge(() => queuePublishedPieces(id, [{ id: docId, kind }]));
    }
    return NextResponse.json({ document: data });
  }
  const { data, error } = await auth.supabase
    .from("crm_booking_documents")
    .update({ visible_to_client: Boolean(body?.visible_to_client) })
    .eq("id", docId)
    .eq("booking_id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  const doc = data as { id: string; kind: string; booking_item_id?: string | null; visible_to_client?: boolean };
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
  const { data: doc, error: readError } = await auth.supabase
    .from("crm_booking_documents")
    .select("id, storage_path, client_storage_path")
    .eq("id", docId)
    .eq("booking_id", id)
    .maybeSingle();
  if (readError) return dbError(readError, 400);
  if (!doc) return jsonError("Pièce introuvable", 404);
  const { error } = await auth.supabase
    .from("crm_booking_documents")
    .delete()
    .eq("id", docId)
    .eq("booking_id", id);
  if (error) return dbError(error, 400);
  await removeCrmFiles([doc.storage_path, doc.client_storage_path].filter(Boolean));
  return NextResponse.json({ ok: true });
}
