import { NextResponse } from "next/server";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { collectPublishIssues } from "@/lib/crm/booking-issues";
import {
  bookingMetaPatch,
  setCarnetPublished,
  syncBookingLedger,
  syncBookingTotalFromItems,
} from "@/lib/crm/bookings";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { BookingDeleteError, deleteBookingById } from "@/lib/crm/delete-booking";
import type { BookingStatus, CrmBooking, CrmCustomer } from "@/lib/crm/types";

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
  if (error) return dbError(error, 500);
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

  const patch = bookingMetaPatch(body);
  if ("title" in patch && !patch.title) return jsonError("Le titre du voyage est obligatoire.");

  if ("customer_id" in patch && !("billing_customer_id" in patch)) {
    const travelerId = String(patch.customer_id);
    const { data: traveler } = await auth.supabase
      .from("crm_customers")
      .select("id, company_role, billing_parent_id")
      .eq("id", travelerId)
      .maybeSingle();
    if (traveler) {
      patch.billing_customer_id = resolveBillingCustomerId(traveler as CrmCustomer);
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
    if (error) return dbError(error, 400);
    booking = data as CrmBooking;
  }
  if ("visible_to_client" in body) {
    try {
      if (body.visible_to_client) {
        const { data: publishItems } = await auth.supabase
          .from("crm_booking_items")
          .select("kind")
          .eq("booking_id", id);
        const publishIssues = collectPublishIssues(publishItems || []);
        if (publishIssues.length) return jsonIssues(publishIssues);
      }
      await setCarnetPublished(auth.supabase, id, Boolean(body.visible_to_client));
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Publication impossible", 400);
    }
    const { data: refreshed } = await auth.supabase
      .from("crm_bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (refreshed) booking = refreshed as CrmBooking;
  }
  try {
    await syncBookingTotalFromItems(auth.supabase, id);
    const { data: priced } = await auth.supabase
      .from("crm_bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (priced) booking = priced as CrmBooking;
    await syncBookingLedger(auth.supabase, booking, prev.status as BookingStatus);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Écritures non retirées", 400);
  }
  return NextResponse.json({ booking });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const result = await deleteBookingById(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suppression impossible";
    const status = err instanceof BookingDeleteError ? err.status : 400;
    return jsonError(message, status);
  }
}
