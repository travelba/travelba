import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import {
  collectIngestFiles,
  parseExtractPayload,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const form = await request.formData();
    const extract = parseExtractPayload(JSON.parse(String(form.get("extract") || "{}")));
    const files = collectIngestFiles(form);
    const booking = await persistNewBookingFromExtract({
      customerId: auth.customer.id,
      extract,
      files,
      status: "draft",
      visibleToClient: true,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enregistrement impossible";
    return jsonError(message, 400);
  }
}
