import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { setCarnetPublished, syncBookingDebit } from "@/lib/crm/bookings";
import { scheduleBookingCover } from "@/lib/crm/cover-generate";
import type { BookingStatus, CrmBooking } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Réservation introuvable", 404);
  return NextResponse.json({ booking: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const { data: current } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!current) return jsonError("Réservation introuvable", 404);
  const prev = current as CrmBooking;

  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "destination",
    "status",
    "start_date",
    "end_date",
    "currency",
    "total_amount",
    "notes_client",
    "notes_internal",
    "customer_id",
  ]) {
    if (key in body) {
      patch[key] = key === "total_amount" ? Number(body[key] || 0) : body[key];
    }
  }

  let booking = prev;
  if (Object.keys(patch).length) {
    const { data, error } = await auth.supabase
      .from("crm_bookings")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return jsonError(error.message, 400);
    booking = data as CrmBooking;
  }
  if ("visible_to_client" in body) {
    await setCarnetPublished(auth.supabase, id, Boolean(body.visible_to_client));
    const { data: refreshed } = await auth.supabase
      .from("crm_bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (refreshed) booking = refreshed as CrmBooking;
  }
  await syncBookingDebit(
    auth.supabase,
    booking,
    prev.status as BookingStatus
  );
  if (
    ("destination" in patch || "title" in patch) &&
    (booking.destination !== prev.destination || booking.title !== prev.title)
  ) {
    scheduleBookingCover(booking, { force: true });
  } else if (!booking.cover_image_path) {
    scheduleBookingCover(booking);
  }
  return NextResponse.json({ booking });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { error } = await auth.supabase.from("crm_bookings").delete().eq("id", id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
