import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  collectIngestFiles,
  parseExtractPayload,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  try {
    const form = await request.formData();
    const customerId = String(form.get("customer_id") || "");
    if (!customerId) return jsonError("Choisissez un client");
    const extract = parseExtractPayload(JSON.parse(String(form.get("extract") || "{}")));
    const files = collectIngestFiles(form);
    const booking = await persistNewBookingFromExtract({
      customerId,
      extract,
      files,
      status: "draft",
      visibleToClient: false,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enregistrement impossible";
    return jsonError(message, 400);
  }
}
