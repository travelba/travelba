import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  applyExtractToBooking,
  collectIngestFiles,
  collectStagedFiles,
  parseExtractPayload,
} from "@/lib/crm/ingest-booking";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const form = await request.formData();
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("customer_id")
      .eq("id", id)
      .maybeSingle();
    if (!booking) return jsonError("Réservation introuvable", 404);
    const extract = parseExtractPayload(JSON.parse(String(form.get("extract") || "{}")));
    const files = collectIngestFiles(form);
    const staged = collectStagedFiles(form);
    const batchId = String(form.get("batch_id") || "");
    await applyExtractToBooking({
      bookingId: id,
      customerId: booking.customer_id,
      extract,
      files,
      staged,
      staffUserId: auth.user.id,
      batchId: batchId || undefined,
      visibleToClient: false,
    });
    return NextResponse.json({ ok: true, booking_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enregistrement impossible";
    return jsonError(message, 400);
  }
}
