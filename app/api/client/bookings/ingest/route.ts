import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { collectIngestFiles, extractBookingFromFiles } from "@/lib/crm/ingest-booking";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  try {
    const form = await request.formData();
    const files = collectIngestFiles(form);
    const extract = await extractBookingFromFiles(files);
    return NextResponse.json({ extract });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lecture impossible";
    return jsonError(message, 400);
  }
}
