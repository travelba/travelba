import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { attachOutgoing, setOutgoingOutsideTrip, TripCostError } from "@/lib/crm/trip-costs-db";
import { tripCostActorFromStaff } from "@/lib/crm/pliant-link";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidateTripAccounting } from "@/lib/crm/trip-costs-paths";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Une dépense Pliant ne va plus au grand livre du client.
 * Elle se rattache à une ligne d’un voyage (coût), ou reste hors voyage.
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("crm_pliant_transactions")
    .select("id, match_status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return jsonError("Dépense introuvable", 404);

  try {
    if (body?.action === "ignore" || body?.action === "refuse" || body?.action === "outside") {
      await setOutgoingOutsideTrip("pliant", id, true, admin);
      revalidateTripAccounting(null);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "restore") {
      await setOutgoingOutsideTrip("pliant", id, false, admin);
      revalidateTripAccounting(null);
      return NextResponse.json({ ok: true });
    }
    const bookingId = String(body?.booking_id || "");
    if (!bookingId) return jsonError("Choisissez le voyage.");
    const cost = await attachOutgoing(
      {
        source: "pliant",
        sourceId: id,
        bookingId,
        itemId: body?.item_id ? String(body.item_id) : null,
        newExpense: body?.new_expense
          ? { title: body.new_expense.title ? String(body.new_expense.title) : null, amount: Number(body.new_expense.amount) }
          : null,
        actor: tripCostActorFromStaff(auth.staff),
      },
      admin
    );
    revalidateTripAccounting(bookingId);
    return NextResponse.json({ cost });
  } catch (error) {
    if (error instanceof TripCostError) return jsonError(error.message, error.status);
    return jsonError("Rattachement impossible. Réessayez.", 400);
  }
}
