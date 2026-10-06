import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireCustomer } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { carnetVisible } from "@/lib/crm/carnet";
import { findExtra } from "@/lib/crm/extras";
import {
  cancelBookingExtra,
  clearServiceRefusal,
  createBookingExtra,
  declineBookingService,
  parseExtraRequest,
  updateTransferAddresses,
} from "@/lib/crm/extras-write";
import { personLabel } from "@/lib/crm/household";
import { notifyServiceRequest } from "@/lib/crm/service-request-mail";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmBooking, CrmBookingItem, CrmBookingTraveler, CrmCompanion, CrmCustomer } from "@/lib/crm/types";
import { recordCustomerActivity, serviceActivitySummary } from "@/lib/crm/customer-activity";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const b = booking as CrmBooking;
  const { data: items } = await auth.supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", b.id);
  const list = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, list)) return jsonError("Séjour introuvable", 404);
  try {
    const extra = parseExtraRequest(body);
    const admin = createServiceClient();
    if (body?.cancel === true) {
      const cancelled = await cancelBookingExtra(admin, {
        booking: b,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
      });
      await recordCustomerActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        action: "extra",
        bookingId: b.id,
        summary: serviceActivitySummary({
          change: "cancel",
          kind: extra.kind,
          leg: extra.leg,
          reference: b.reference,
          title: b.title,
          destination: b.destination,
        }),
      });
      return NextResponse.json(cancelled);
    }
    if (body?.addresses === true) {
      if (extra.kind !== "chauffeur") {
        return jsonError("Seule l’adresse d’un transfert se modifie ainsi.");
      }
      const current = findExtra(list, "chauffeur", extra.leg, extra.place, null) as CrmBookingItem | null;
      const previousDepart = String(current?.details?.depart_address || "").trim();
      const previousArrive = String(current?.details?.arrive_address || "").trim();
      const updated = await updateTransferAddresses(admin, {
        booking: b,
        items: list,
        leg: extra.leg,
        place: extra.place,
        departAddress: extra.depart || "",
        arriveAddress: extra.arrive || "",
      });
      const depart = (extra.depart || "").trim();
      const arrive = (extra.arrive || "").trim();
      if (current && (depart !== previousDepart || arrive !== previousArrive)) {
        await notifyServiceRequest({
          reference: b.reference,
          bookingId: b.id,
          holderName: personLabel(auth.customer.first_name, auth.customer.last_name) || "Client",
          currency: b.currency,
          amount: Number(current.amount) || 0,
          reason: "addresses",
          item: {
            ...current,
            details: { ...(current.details || {}), depart_address: depart, arrive_address: arrive },
          },
          items: list,
        });
      }
      await recordCustomerActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        action: "extra",
        bookingId: b.id,
        summary: serviceActivitySummary({
          change: "address",
          kind: extra.kind,
          leg: extra.leg,
          reference: b.reference,
          title: b.title,
          destination: b.destination,
        }),
        detail: [extra.depart, extra.arrive].map((part) => (part || "").trim()).filter(Boolean).join(" → ") || null,
      });
      return NextResponse.json(updated);
    }
    if (body?.decline === true) {
      const declined = await declineBookingService(admin, {
        booking: b,
        items: list,
        kind: extra.kind,
        leg: extra.leg,
        place: extra.place,
        moment: extra.moment,
      });
      await recordCustomerActivity({
        customerId: auth.customer.id,
        authUserId: auth.user.id,
        action: "extra",
        bookingId: b.id,
        summary: serviceActivitySummary({
          change: "decline",
          kind: extra.kind,
          leg: extra.leg,
          reference: b.reference,
          title: b.title,
          destination: b.destination,
        }),
      });
      return NextResponse.json(declined);
    }
    if (body?.resume === true) {
      await clearServiceRefusal(admin, b.id, extra.kind, extra.leg, extra.place, extra.moment);
    }
    const [{ data: travelers }, { data: companions }] = await Promise.all([
      admin.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
      admin.from("crm_travel_companions").select("*").eq("customer_id", auth.customer.id),
    ]);
    const created = await createBookingExtra(admin, {
      booking: b,
      items: list,
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: auth.customer as CrmCustomer,
      companions: (companions || []) as CrmCompanion[],
      kind: extra.kind,
      leg: extra.leg,
      place: extra.place,
      moment: extra.moment,
      address: extra.address,
      departAddress: extra.depart,
      arriveAddress: extra.arrive,
      rateId: extra.rateId,
      vehicle: extra.vehicle,
      enforceWindow: true,
    });
    if (extra.kind === "chauffeur" || extra.kind === "greeter" || extra.kind === "checkin") {
      await notifyServiceRequest({
        reference: b.reference,
        bookingId: b.id,
        holderName: personLabel(auth.customer.first_name, auth.customer.last_name) || "Client",
        currency: b.currency,
        amount: created.amount,
        reason: "validated",
        item: created.item,
        items: list,
      });
    }
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "extra",
      bookingId: b.id,
      summary: serviceActivitySummary({
        change: "ask",
        kind: extra.kind,
        leg: extra.leg,
        reference: b.reference,
        title: b.title,
        destination: b.destination,
      }),
    });
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    return jsonError(err instanceof Error ? err.message : "Demande impossible", 400);
  }
}
