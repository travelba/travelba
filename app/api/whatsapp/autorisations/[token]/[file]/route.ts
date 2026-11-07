import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { downloadCrmFile } from "@/lib/crm/files";
import { verifyVisaGrantToken } from "@/lib/crm/visa-grant-link";
import { verifyFreeMessageToken } from "@/lib/crm/free-message-link";
import { freeMessagePublicFile, loadFreeMessageDocument, readFreeMessageBytes } from "@/lib/crm/free-message-file";
import {
  VISA_GRANT_SAMPLE_IMAGE,
  VISA_GRANT_SAMPLE_PDF,
  visaGrantHeader,
  visaGrantSamplePdf,
} from "@/lib/crm/visa-grant-whatsapp";
import { isTravelAuthorization } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function fileResponse(bytes: Uint8Array, filename: string, contentType: string) {
  const safe = filename.replace(/["\\\r\n]/g, "").slice(0, 180);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function contentTypeFor(filename: string, stored: string) {
  const header = visaGrantHeader(stored, filename);
  if (header === "document") return "application/pdf";
  if (filename.toLowerCase().endsWith(".png") || stored.toLowerCase().includes("png")) return "image/png";
  if (header === "image") return "image/jpeg";
  return null;
}

/** Fichier d’autorisation joignable par WhatsApp. Le jeton expire. L’exemple n’a pas de voyageur. */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string; file: string }> }) {
  const { token, file } = await ctx.params;
  let filename = file;
  try {
    filename = decodeURIComponent(file);
  } catch {
    return jsonError("Document introuvable", 404);
  }
  if (filename.includes("/") || filename.includes("\\") || !visaGrantHeader(null, filename)) {
    return jsonError("Document introuvable", 404);
  }

  if (token === "exemple" && filename === VISA_GRANT_SAMPLE_PDF) {
    return fileResponse(visaGrantSamplePdf(), "ESTA-Exemple.pdf", "application/pdf");
  }
  if (token === "exemple" && filename === VISA_GRANT_SAMPLE_IMAGE) {
    try {
      const bytes = await readFile(path.join(process.cwd(), "public", "whatsapp", "visa.jpg"));
      return fileResponse(bytes, "ESTA-Exemple.jpg", "image/jpeg");
    } catch {
      return jsonError("Document introuvable", 404);
    }
  }

  const verified = verifyVisaGrantToken(token, filename);
  if (!verified) return serveFreeMessage(token, filename);

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_travel_documents")
      .select("id, doc_type, mime_type, storage_path")
      .eq("id", verified.documentId)
      .maybeSingle();
    const storage = String(data?.storage_path || "");
    const mime = String(data?.mime_type || "");
    if (!data || !isTravelAuthorization(data.doc_type) || !storage) return jsonError("Document introuvable", 404);
    const type = contentTypeFor(filename, mime);
    const storedHeader = visaGrantHeader(mime, storage);
    const namedHeader = visaGrantHeader(null, filename);
    if (!type || !storedHeader || storedHeader !== namedHeader) return jsonError("Document introuvable", 404);
    const downloaded = await downloadCrmFile(storage);
    const actual = visaGrantHeader(downloaded.contentType, storage);
    if (actual !== namedHeader) return jsonError("Document introuvable", 404);
    return fileResponse(downloaded.bytes, filename, type);
  } catch {
    return jsonError("Document introuvable", 404);
  }
}

/** Pièce déjà déposée, jointe à un message libre. Le jeton n’est pas celui de l’autorisation. */
async function serveFreeMessage(token: string, filename: string) {
  const verified = verifyFreeMessageToken(token, filename);
  if (!verified) return jsonError("Document introuvable", 404);
  try {
    const admin = createServiceClient();
    const row = await loadFreeMessageDocument(admin, verified.documentId);
    const gate = row
      ? freeMessagePublicFile(
          { docType: row.docType, mime: row.mime, storagePath: row.storagePath, fileName: row.fileName },
          filename
        )
      : null;
    if (!row || !gate) return jsonError("Document introuvable", 404);
    const bytes = await readFreeMessageBytes(gate.storagePath, gate.header);
    if (!bytes) return jsonError("Document introuvable", 404);
    return fileResponse(bytes, filename, gate.contentType);
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
