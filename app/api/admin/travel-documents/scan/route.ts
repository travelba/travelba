import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { bindGatewayAuth } from "@/lib/crm/ingest-types";
import { scanTravelDocument } from "@/lib/crm/ocr-document";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  bindGatewayAuth(request);
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("Photo requise");
  }
  try {
    const result = await scanTravelDocument(file);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[travel-documents/scan]", err);
    const message = err instanceof Error ? err.message : "Lecture impossible";
    return jsonError(message, 400);
  }
}
