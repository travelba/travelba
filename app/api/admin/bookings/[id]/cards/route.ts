import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { issueBookingCard, setBookingCardLocked, terminateBookingCard } from "@/lib/crm/booking-cards";
import { ownedBookingPliantCard } from "@/lib/crm/pliant-booking";
import { pliantConfigured, pliantPciWidget } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        amount?: string;
        firstName?: string;
        lastName?: string;
        designation?: string;
        transactionAmount?: string;
        transactionCount?: string;
        itemId?: string;
        pliantCardId?: string;
      }
    | null;
  const action = body?.action;
  if (!action) return jsonError("Action incomplète", 400);

  const admin = createServiceClient();

  if (action === "issue") {
    try {
      await issueBookingCard(admin, {
        bookingId: id,
        amount: typeof body?.amount === "string" ? body.amount : "",
        firstName: typeof body?.firstName === "string" ? body.firstName : "",
        lastName: typeof body?.lastName === "string" ? body.lastName : "",
        designation: typeof body?.designation === "string" ? body.designation : "",
        transactionAmount: typeof body?.transactionAmount === "string" ? body.transactionAmount : "",
        transactionCount: typeof body?.transactionCount === "string" ? body.transactionCount : "",
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être créée.", 400);
    }
  }

  if (action === "lock" || action === "unlock" || action === "terminate") {
    const cardRowId = (body?.itemId || "").trim();
    if (!cardRowId) return jsonError("Carte introuvable.", 404);
    try {
      if (action === "terminate") await terminateBookingCard(admin, id, cardRowId);
      else await setBookingCardLocked(admin, id, cardRowId, action === "lock");
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être mise à jour.", 400);
    }
  }

  if (action === "card") {
    const requestedPliantId = (body?.pliantCardId || "").trim();
    if (requestedPliantId) {
      const [cardRows, arrivalRows, registryRows] = await Promise.all([
        admin.from("crm_booking_cards").select("pliant_card_id, status").eq("booking_id", id),
        admin
          .from("crm_hotel_arrivals")
          .select("booking_item_id, pliant_card_id, card_closed_at")
          .eq("booking_id", id),
        admin.from("crm_pliant_cards").select("pliant_card_id, status").eq("booking_id", id),
      ]);
      if (cardRows.error || arrivalRows.error || registryRows.error) {
        return jsonError("La carte n’a pas pu être lue.", 500);
      }
      const owned = ownedBookingPliantCard({
        pliantCardId: requestedPliantId,
        bookingCards: (cardRows.data || []) as { pliant_card_id: string; status: string | null }[],
        arrivals: (arrivalRows.data || []) as {
          booking_item_id: string;
          pliant_card_id: string | null;
          card_closed_at: string | null;
        }[],
        registry: (registryRows.data || []) as { pliant_card_id: string; status: string | null }[],
      });
      if (!owned) return jsonError("Carte introuvable.", 404);
      if ("closed" in owned) return jsonError("Cette carte est clôturée.", 400);
      if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
      try {
        const frameKey = requestedPliantId.replace(/[^\w-]/g, "").slice(0, 40);
        const widget = await pliantPciWidget(requestedPliantId, `carte-${frameKey}`);
        const { error: viewError } = await admin.from("crm_card_views").insert({
          staff_id: auth.staff.id,
          booking_id: id,
          booking_item_id: owned.itemId,
          source: "pliant",
          viewer: "staff",
        });
        if (viewError) return jsonError("La consultation n’a pas pu être notée.", 500);
        return NextResponse.json(
          { widgetUrl: widget.src, frameId: widget.frameId },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      } catch {
        return jsonError("La carte n’a pas pu être lue.", 502);
      }
    }

    const cardId = (body?.itemId || "").trim();
    if (!cardId) return jsonError("Carte introuvable.", 404);
    const { data } = await admin
      .from("crm_booking_cards")
      .select("id, pliant_card_id")
      .eq("booking_id", id)
      .eq("id", cardId)
      .maybeSingle();
    const row = data as { id: string; pliant_card_id: string } | null;
    if (!row?.pliant_card_id) return jsonError("Carte introuvable.", 404);
    if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
    try {
      const widget = await pliantPciWidget(row.pliant_card_id, `carte-${row.id}`);
      return NextResponse.json({ widgetUrl: widget.src, frameId: widget.frameId });
    } catch {
      return jsonError("La carte n’a pas pu être lue.", 502);
    }
  }

  return jsonError("Action inconnue", 400);
}
