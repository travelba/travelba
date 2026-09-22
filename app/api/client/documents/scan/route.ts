import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { scanTravelDocument } from "@/lib/crm/ocr-document";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Fichier requis");
  }
  try {
    const result = await scanTravelDocument(file);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[client/documents/scan]", err);
    const message = err instanceof Error ? err.message : "Lecture impossible";
    return jsonError(message, 400);
  }
}
