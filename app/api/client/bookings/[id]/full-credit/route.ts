import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { carnetVisible, hotelDisplayName, nightsBetween } from "@/lib/crm/carnet";
import { hotelContact } from "@/lib/crm/hotel-contact";
import {
  fullCreditCeilingCents,
  fullCreditLetterForItem,
  fullCreditRefusal,
  usableHotelEmail,
} from "@/lib/crm/full-credit";
import { notifyFullCreditAsked } from "@/lib/crm/full-credit-mail";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function personName(first: string | null | undefined, last: string | null | undefined) {
  return [first, last].map((part) => (part || "").trim()).filter(Boolean).join(" ");
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id: reference } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { itemId?: string };
  const itemId = (body.itemId || "").trim();
  if (!itemId) return jsonError("Hôtel manquant.");

  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) return jsonError("Séjour introuvable", 404);
  const stay = booking as CrmBooking;

  const [{ data: items }, { data: itemRow }, { data: existing }] = await Promise.all([
    auth.supabase.from("crm_booking_items").select("id, kind, visible_to_client").eq("booking_id", stay.id),
    auth.supabase.from("crm_booking_items").select("*").eq("id", itemId).eq("booking_id", stay.id).maybeSingle(),
    auth.supabase.from("crm_full_credits").select("status").eq("booking_item_id", itemId).maybeSingle(),
  ]);
  const list = (items || []) as Pick<CrmBookingItem, "id" | "kind" | "visible_to_client">[];
  if (!carnetVisible(stay, list as CrmBookingItem[])) return jsonError("Séjour introuvable", 404);
  const item = itemRow as CrmBookingItem | null;
  if (!item || !item.visible_to_client) return jsonError("Séjour introuvable", 404);

  const refusal = fullCreditRefusal({
    visible: stay.visible_to_client,
    status: stay.status,
    clientSettles: stay.client_settles_stay === true,
    kind: item.kind,
    startAt: item.start_at,
    endAt: item.end_at,
    now: new Date(),
    existingStatus: (existing as { status?: string } | null)?.status,
  });
  if (refusal) return jsonError(refusal, refusal === "Séjour introuvable" ? 404 : 400);

  const nights = nightsBetween(item.start_at, item.end_at);
  const ceilingCents = nights ? fullCreditCeilingCents(nights) : null;
  const letter = fullCreditLetterForItem({
    guestName: personName(auth.customer.first_name, auth.customer.last_name),
    reference: stay.reference,
    item,
  });
  if (!nights || !ceilingCents || !letter) return jsonError("Les dates de l’hôtel ne permettent pas la demande.");

  const hotelName = hotelDisplayName(item);
  const { error } = await auth.supabase.from("crm_full_credits").insert({
    booking_id: stay.id,
    booking_item_id: item.id,
    status: "demandee",
    nights,
    ceiling_cents: ceilingCents,
    hotel_email: usableHotelEmail(hotelContact(item).email),
    draft_subject: letter.subject,
    draft_body: letter.text,
  });
  if (error?.code === "23505") return jsonError("Demande déjà transmise.");
  if (error) return jsonError("La demande n’a pas été enregistrée.");

  await notifyFullCreditAsked({ reference: stay.reference, hotelName, bookingId: stay.id });
  return NextResponse.json({ status: "demandee" });
}
