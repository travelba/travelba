import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { nextBookingReference, syncBookingDebit } from "@/lib/crm/bookings";
import type { CrmBooking } from "@/lib/crm/types";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ bookings: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const title = String(body?.title || "").trim();
  if (!customerId || !title) return jsonError("Client et titre requis");
  let reference: string;
  try {
    reference = await nextBookingReference(auth.supabase);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Référence", 500);
  }
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .insert({
      customer_id: customerId,
      reference,
      title,
      destination: body?.destination || null,
      status: body?.status || "draft",
      start_date: body?.start_date || null,
      end_date: body?.end_date || null,
      currency: body?.currency || "EUR",
      total_amount: Number(body?.total_amount || 0),
      notes_client: body?.notes_client || null,
      notes_internal: body?.notes_internal || null,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  const booking = data as CrmBooking;
  await syncBookingDebit(auth.supabase, booking);
  return NextResponse.json({ booking });
}
