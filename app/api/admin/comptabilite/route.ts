import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { attachOutgoing, detachTripCost, moveOutgoing, refuseOutgoingSuggestion, retargetTripCost, setOutgoingOutsideTrip, TripCostError } from "@/lib/crm/trip-costs-db";
import { tripCostActorFromStaff } from "@/lib/crm/pliant-link";
import { revalidateTripAccounting } from "@/lib/crm/trip-costs-paths";
import type { TripCostSource } from "@/lib/crm/trip-costs";

function sourceOf(value: unknown): TripCostSource | null {
  return value === "pliant" || value === "revolut" ? value : null;
}

/**
 * Comptabilité du voyage. Tout part d’un clic :
 *  - `attach`  : rattache une sortie à une ligne du voyage (ou une nouvelle dépense) ;
 *  - `move`    : change de dossier ;
 *  - `refuse`  : écarte la proposition, la sortie reste à proposer ;
 *  - `outside` : hors voyage (frais d’agence) ; `restore` la remet dans la file ;
 *  - `detach`  : retire un coût, la sortie revient à proposer ;
 *  - `retarget` : déplace un coût vers une autre ligne du même voyage.
 */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Requête vide.");
  const actor = tripCostActorFromStaff(auth.staff);
  try {
    if (body.action === "detach") {
      const cost = await detachTripCost(String(body.cost_id || ""), undefined, actor);
      revalidateTripAccounting(cost.bookingId);
      return NextResponse.json({ ok: true, cost });
    }
    if (body.action === "retarget") {
      const cost = await retargetTripCost(String(body.cost_id || ""), body.item_id ? String(body.item_id) : null);
      revalidateTripAccounting(cost.bookingId);
      return NextResponse.json({ ok: true, cost });
    }
    const source = sourceOf(body.source);
    const id = String(body.id || "");
    if (!source || !id) return jsonError("Sortie inconnue.");
    if (body.action === "outside" || body.action === "restore") {
      await setOutgoingOutsideTrip(source, id, body.action === "outside");
      revalidateTripAccounting(null);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "refuse") {
      const bookingId = String(body.booking_id || "");
      if (!bookingId) return jsonError("Choisissez le voyage.");
      await refuseOutgoingSuggestion({ source, sourceId: id, bookingId, actor });
      revalidateTripAccounting(null);
      return NextResponse.json({ ok: true });
    }
    const bookingId = String(body.booking_id || "");
    if (!bookingId) return jsonError("Choisissez le voyage.");
    const expense = body.new_expense as { title?: unknown; amount?: unknown } | null | undefined;
    const link = {
      source,
      sourceId: id,
      bookingId,
      itemId: body.item_id ? String(body.item_id) : null,
      stayOnly: body.stay === true,
      newExpense: expense ? { title: expense.title ? String(expense.title) : null, amount: Number(expense.amount) } : null,
      eurAmount: body.eur_amount == null || body.eur_amount === "" ? null : Number(body.eur_amount),
      actor,
    };
    const cost = body.action === "move" ? await moveOutgoing(link) : await attachOutgoing(link);
    revalidateTripAccounting(bookingId);
    const previous = "previousBookingId" in cost ? cost.previousBookingId : null;
    if (typeof previous === "string" && previous !== bookingId) revalidateTripAccounting(previous);
    return NextResponse.json({ cost });
  } catch (error) {
    if (error instanceof TripCostError) return jsonError(error.message, error.status);
    console.error("[comptabilite]", error instanceof Error ? error.message : error);
    return jsonError("Opération impossible. Réessayez.", 400);
  }
}
