import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { verifyBoardingPassToken } from "@/lib/crm/boarding-pass-link";
import {
  BOARDING_PASS_KIND,
  BOARDING_PASS_SAMPLE_FILE,
  BOARDING_PASS_SAMPLE_NAME,
  boardingPassDownloadHeaders,
} from "@/lib/crm/boarding-pass-whatsapp";
import { downloadCrmFile } from "@/lib/crm/files";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function pdfResponse(bytes: Uint8Array, filename: string) {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: boardingPassDownloadHeaders(filename),
  });
}

async function samplePdf() {
  const file = path.join(process.cwd(), "public", "whatsapp", BOARDING_PASS_SAMPLE_FILE);
  return readFile(file);
}

/** PDF joignable par WhatsApp. Le jeton expire. Le fichier d’exemple n’a pas de voyageur. */
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

  if (token === "exemple" && filename === BOARDING_PASS_SAMPLE_FILE) {
    try {
      return pdfResponse(await samplePdf(), BOARDING_PASS_SAMPLE_NAME);
    } catch {
      return jsonError("Document introuvable", 404);
    }
  }

  const verified = verifyBoardingPassToken(token, filename);
  if (!verified) return jsonError("Document introuvable", 404);

  try {
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_booking_documents")
      .select("id, kind, mime_type, storage_path")
      .eq("id", verified.documentId)
      .maybeSingle();
    const mime = String(data?.mime_type || "").toLowerCase();
    const storage = String(data?.storage_path || "");
    if (!data || data.kind !== BOARDING_PASS_KIND) {
      return jsonError("Document introuvable", 404);
    }
    if (!mime.includes("pdf") && !storage.toLowerCase().endsWith(".pdf")) {
      return jsonError("Document introuvable", 404);
    }
    const downloaded = await downloadCrmFile(storage);
    const type = downloaded.contentType.toLowerCase();
    if (!type.includes("pdf") && !storage.toLowerCase().endsWith(".pdf")) {
      return jsonError("Document introuvable", 404);
    }
    return pdfResponse(downloaded.bytes, filename);
  } catch {
    return jsonError("Document introuvable", 404);
  }
}
