import { NextResponse } from "next/server";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { collectPublishIssues } from "@/lib/crm/booking-issues";
import {
  bookingMetaPatch,
  setCarnetPublished,
  syncBookingLedger,
  syncBookingTotalFromItems,
} from "@/lib/crm/bookings";
import { parseBillingCompanyId } from "@/lib/crm/billing-companies";
import { resolveBillingCustomerId } from "@/lib/crm/company-role";
import { BookingDeleteError, deleteBookingById } from "@/lib/crm/delete-booking";
import { normalizePieceKind } from "@/lib/crm/concierge-notices";
import {
  notifyStayPublished,
  queuePublishedPieces,
  remindMissingPieces,
  safeConcierge,
} from "@/lib/crm/concierge-send";
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

  if ("billing_company_id" in patch && patch.billing_company_id) {
    const parsed = parseBillingCompanyId(patch.billing_company_id);
    if ("error" in parsed) return jsonError(parsed.error);
    const payerId = String(patch.billing_customer_id || prev.billing_customer_id || prev.customer_id);
    const { data: company } = await auth.supabase
      .from("crm_billing_companies")
      .select("id")
      .eq("id", parsed.id)
      .eq("customer_id", payerId)
      .maybeSingle();
    if (!company) return jsonError("Cette société n’est pas sur le compte facturé.");
    patch.billing_company_id = parsed.id;
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
  let revealedPieces: { id: string; kind: string | null }[] = [];
  if ("visible_to_client" in body && body.visible_to_client && prev.visible_to_client) {
    const { data: hidden } = await auth.supabase
      .from("crm_booking_documents")
      .select("id, kind, booking_item_id")
      .eq("booking_id", id)
      .eq("visible_to_client", false);
    const itemIds = [
      ...new Set(
        ((hidden || []) as { booking_item_id?: string | null }[])
          .map((doc) => doc.booking_item_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];
    const kinds = new Map<string, string>();
    if (itemIds.length) {
      const { data: linked } = await auth.supabase
        .from("crm_booking_items")
        .select("id, kind")
        .in("id", itemIds);
      for (const item of (linked || []) as { id: string; kind: string }[]) kinds.set(item.id, item.kind);
    }
    revealedPieces = ((hidden || []) as { id: string; kind: string; booking_item_id?: string | null }[])
      .map((doc) => ({
        id: doc.id,
        kind: (doc.booking_item_id && kinds.get(doc.booking_item_id)) || doc.kind,
      }))
      .filter((doc) => normalizePieceKind(doc.kind));
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
    if (body.visible_to_client && !prev.visible_to_client) {
      await safeConcierge(() => notifyStayPublished(id));
      await safeConcierge(() => remindMissingPieces(id));
    } else if (revealedPieces.length) {
      await safeConcierge(() => queuePublishedPieces(id, revealedPieces));
    }
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
