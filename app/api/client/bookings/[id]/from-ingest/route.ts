import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import {
  applyExtractToBooking,
  collectIngestFiles,
  parseExtractPayload,
} from "@/lib/crm/ingest-booking";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("id, customer_id")
      .eq("id", id)
      .eq("customer_id", auth.customer.id)
      .maybeSingle();
    if (!booking) return jsonError("Réservation introuvable", 404);
    const form = await request.formData();
    const extract = parseExtractPayload(JSON.parse(String(form.get("extract") || "{}")));
    const files = collectIngestFiles(form);
    await applyExtractToBooking({
      bookingId: id,
      customerId: auth.customer.id,
      extract,
      files,
      visibleToClient: true,
    });
    return NextResponse.json({ ok: true, booking_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enregistrement impossible";
    return jsonError(message, 400);
  }
}
