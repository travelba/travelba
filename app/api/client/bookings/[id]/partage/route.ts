import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { clientVisibleItems } from "@/lib/crm/carnet";
import { stayTitleFromItems } from "@/lib/crm/staff-stay";
import { liveConciergeImage, whatsappTypeImageUrl } from "@/lib/crm/concierge-notices";
import { planTripShareSend, sendTripShareWhatsapp, tripShareUrl } from "@/lib/crm/trip-share";
import { ensureTripShareCode } from "@/lib/crm/trip-share-load";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import type { CrmBooking } from "@/lib/crm/types";
import { recordCustomerActivity, shareActivitySummary, stayMention } from "@/lib/crm/customer-activity";

type Ctx = { params: Promise<{ id: string }> };

/** Le clic du voyageur principal envoie le lien. Rien ne part à la publication. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const companionId = String(body?.companion_id || "");
  if (!companionId) return jsonError("Accompagnateur requis");

  const { data } = await auth.supabase
    .from("crm_bookings")
    .select("id, reference, title, destination, visible_to_client, customer_id")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  const booking = data as Pick<CrmBooking, "id" | "reference" | "title" | "destination" | "visible_to_client"> | null;
  if (!booking?.visible_to_client) return jsonError("Ce voyage n’est pas publié", 404);
  if (!auth.customer.phone?.trim()) {
    return jsonError("Ajoutez un téléphone dans Vous pour envoyer ce lien.");
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return jsonError("Envoi indisponible. Le lien reste à copier.", 503);
  }
  const code = await ensureTripShareCode(admin, booking.id);
  if (!code) return jsonError("Ce voyage n’est pas publié", 404);

  const [{ data: travelers }, { data: companions }] = await Promise.all([
    auth.supabase
      .from("crm_booking_travelers")
      .select("companion_id, is_account_holder")
      .eq("booking_id", booking.id),
    auth.supabase
      .from("crm_travel_companions")
      .select("id, first_name, phone")
      .eq("customer_id", auth.customer.id),
  ]);

  const plan = planTripShareSend({
    companionId,
    travelers: travelers || [],
    companions: companions || [],
  });
  if (!plan.ok) {
    if (plan.reason === "no_phone") {
      return jsonError("Cet accompagnateur n’a pas de téléphone. Le lien reste à copier.", 400);
    }
    return jsonError("Accompagnateur introuvable sur ce voyage", 404);
  }

  const { data: itemRows } = await auth.supabase
    .from("crm_booking_items")
    .select("kind, title, start_at, end_at, sort_order, details, visible_to_client")
    .eq("booking_id", booking.id);
  const mediaUrl = await liveConciergeImage(whatsappTypeImageUrl("partage"));
  const result = await sendTripShareWhatsapp({
    phone: plan.phone,
    firstName: plan.firstName,
    title: stayTitleFromItems(
      booking.title,
      booking.destination,
      clientVisibleItems(itemRows || [])
    ),
    url: tripShareUrl(siteConfig.url, code),
    mediaUrl,
  });
  if (result.ok) {
    await recordCustomerActivity({
      customerId: auth.customer.id,
      authUserId: auth.user.id,
      action: "share",
      summary: shareActivitySummary(plan.firstName, stayMention(booking.reference, booking.title, booking.destination)),
      detail: plan.phone,
      bookingId: booking.id,
    });
    return NextResponse.json({ ok: true });
  }
  if (result.reason === "not_configured") {
    return jsonError("WhatsApp n’est pas disponible. Le lien reste à copier.", 503);
  }
  return jsonError("WhatsApp n’a pas pu envoyer le message. Le lien reste à copier.", 502);
}
