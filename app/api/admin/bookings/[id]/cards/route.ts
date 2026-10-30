import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { formatJournalAmount, maskedCard } from "@/lib/crm/agency-journal-kinds";
import { issueBookingCard, setBookingCardLocked, terminateBookingCard } from "@/lib/crm/booking-cards";
import { ownedBookingPliantCard } from "@/lib/crm/pliant-booking";
import { pliantConfigured, pliantPciWidget } from "@/lib/crm/pliant";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type CardFace = { last4: string | null; limitCents: number | null; label?: string | null };

function cardWords(face: CardFace) {
  const card = maskedCard(face.last4);
  const amount = formatJournalAmount(face.limitCents);
  return `${card ? ` ${card}` : ""}${face.label ? ` (${face.label})` : ""}${amount ? `, plafond ${amount}` : ""}`;
}

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
  const path = `/api/admin/bookings/${id}/cards`;

  if (action === "issue") {
    try {
      const issued = await issueBookingCard(admin, {
        bookingId: id,
        amount: typeof body?.amount === "string" ? body.amount : "",
        firstName: typeof body?.firstName === "string" ? body.firstName : "",
        lastName: typeof body?.lastName === "string" ? body.lastName : "",
        designation: typeof body?.designation === "string" ? body.designation : "",
        transactionAmount: typeof body?.transactionAmount === "string" ? body.transactionAmount : "",
        transactionCount: typeof body?.transactionCount === "string" ? body.transactionCount : "",
      });
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "create",
        entityType: "card",
        entityId: id,
        summary: `Carte Pliant émise${cardWords(issued)}.`,
        diff: { carte: issued.label, plafond: formatJournalAmount(issued.limitCents) },
        kind: "carte_emise",
        bookingId: id,
        amountCents: issued.limitCents,
        cardLast4: issued.last4,
        sensitive: "payment",
        path,
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
      const face =
        action === "terminate"
          ? await terminateBookingCard(admin, id, cardRowId)
          : await setBookingCardLocked(admin, id, cardRowId, action === "lock");
      const verb = action === "terminate" ? "clôturée" : action === "lock" ? "bloquée" : "débloquée";
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: action === "terminate" ? "delete" : "update",
        entityType: "card",
        entityId: id,
        summary: `Carte Pliant ${verb}${cardWords({ ...face, limitCents: null })}.`,
        diff: { statut: { avant: action === "unlock" ? "bloquée" : "active", apres: verb } },
        kind: action === "terminate" ? "carte_cloturee" : action === "lock" ? "carte_bloquee" : "carte_debloquee",
        bookingId: id,
        cardLast4: face.last4,
        path,
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "La carte n’a pas pu être mise à jour.", 400);
    }
  }

  if (action === "card") {
    const requestedPliantId = (body?.pliantCardId || "").trim();
    if (requestedPliantId) {
      const [cardRows, arrivalRows, registryRows] = await Promise.all([
        admin.from("crm_booking_cards").select("pliant_card_id, status, last4").eq("booking_id", id),
        admin
          .from("crm_hotel_arrivals")
          .select("booking_item_id, pliant_card_id, card_closed_at, card_last4")
          .eq("booking_id", id),
        admin.from("crm_pliant_cards").select("pliant_card_id, status, last4").eq("booking_id", id),
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
      const last4 =
        ((cardRows.data || []) as { pliant_card_id: string; last4?: string | null }[]).find((row) => row.pliant_card_id === requestedPliantId)?.last4 ||
        ((registryRows.data || []) as { pliant_card_id: string; last4?: string | null }[]).find((row) => row.pliant_card_id === requestedPliantId)?.last4 ||
        ((arrivalRows.data || []) as { pliant_card_id: string | null; card_last4?: string | null }[]).find((row) => row.pliant_card_id === requestedPliantId)?.card_last4 ||
        null;
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
        await recordAgencyJournal({
          staffId: auth.staff.id,
          action: "reveal",
          entityType: "card",
          entityId: id,
          summary: `Carte Pliant${maskedCard(last4) ? ` ${maskedCard(last4)}` : ""} ouverte (numéro complet).`,
          sensitive: "card_reveal",
          kind: "carte_ouverte",
          bookingId: id,
          cardLast4: last4,
          path,
        });
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
      .select("id, pliant_card_id, last4")
      .eq("booking_id", id)
      .eq("id", cardId)
      .maybeSingle();
    const row = data as { id: string; pliant_card_id: string; last4?: string | null } | null;
    if (!row?.pliant_card_id) return jsonError("Carte introuvable.", 404);
    if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
    try {
      const widget = await pliantPciWidget(row.pliant_card_id, `carte-${row.id}`);
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "reveal",
        entityType: "card",
        entityId: id,
        summary: `Carte Pliant${maskedCard(row.last4) ? ` ${maskedCard(row.last4)}` : ""} ouverte (numéro complet).`,
        sensitive: "card_reveal",
        kind: "carte_ouverte",
        bookingId: id,
        cardLast4: row.last4 ?? null,
        path,
      });
      return NextResponse.json({ widgetUrl: widget.src, frameId: widget.frameId });
    } catch {
      return jsonError("La carte n’a pas pu être lue.", 502);
    }
  }

  return jsonError("Action inconnue", 400);
}
