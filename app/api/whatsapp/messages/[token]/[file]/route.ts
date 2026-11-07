import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { downloadCrmFile } from "@/lib/crm/files";
import { verifyFreeMessageToken } from "@/lib/crm/free-message-link";
import {
  FREE_MESSAGE_SAMPLE_FILE,
  FREE_MESSAGE_SAMPLE_NAME,
  freeMessageSamplePdf,
  isPdfDocument,
} from "@/lib/crm/free-message-whatsapp";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function pdfResponse(bytes: Uint8Array, filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, "").slice(0, 180);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type StoredFile = { mime_type?: string | null; file_name?: string | null; storage_path?: string | null };

/** PDF joignable par WhatsApp. Le jeton expire. L’exemple n’a pas de client. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await ctx.params;
  let filename = file;
  try {
    filename = decodeURIComponent(file);
  } catch {
    return jsonError("Document introuvable", 404);
  }
  if (filename.includes("/") || filename.includes("\\") || !filename.toLowerCase().endsWith(".pdf")) {
    return jsonError("Document introuvable", 404);
  }
  if (token === "exemple" && filename === FREE_MESSAGE_SAMPLE_FILE) {
    return pdfResponse(freeMessageSamplePdf(), FREE_MESSAGE_SAMPLE_NAME);
  }
  const verified = verifyFreeMessageToken(token, filename);
  if (!verified) return jsonError("Document introuvable", 404);
  try {
    const admin = createServiceClient();
    const booking = await admin
      .from("crm_booking_documents")
      .select("id, mime_type, file_name, storage_path")
      .eq("id", verified.documentId)
      .maybeSingle();
    let row = (booking.data || null) as StoredFile | null;
    if (!row?.storage_path) {
      const travel = await admin
        .from("crm_travel_documents")
        .select("id, mime_type, file_name, storage_path")
        .eq("id", verified.documentId)
        .maybeSingle();
      row = (travel.data || null) as StoredFile | null;
    }
    const storage = String(row?.storage_path || "");
    if (!row || !storage || !isPdfDocument(row.mime_type, row.file_name || filename)) {
      return jsonError("Document introuvable", 404);
    }
    const downloaded = await downloadCrmFile(storage);
    const head = Buffer.from(downloaded.bytes.subarray(0, 5)).toString("utf8");
    if (head !== "%PDF-") return jsonError("Document introuvable", 404);
    return pdfResponse(downloaded.bytes, filename);
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
