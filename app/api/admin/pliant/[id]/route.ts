import { NextResponse } from "next/server";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { formatJournalAmount } from "@/lib/crm/agency-journal-kinds";
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
    .select("id, match_status, billing_cents, billing_currency, merchant, card_last4")
    .eq("id", id)
    .maybeSingle();
  if (!row) return jsonError("Dépense introuvable", 404);
  const movement = row as {
    billing_cents?: number | null;
    billing_currency?: string | null;
    merchant?: string | null;
    card_last4?: string | null;
  };
  const amountCents = movement.billing_cents == null ? null : Math.abs(movement.billing_cents);
  const merchant = (movement.merchant || "").trim();
  const journal = (kind: "fournisseur_paye" | "depense_hors_voyage", summary: string, bookingId: string | null) =>
    recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "finance",
      entityId: id,
      summary,
      kind,
      bookingId,
      amountCents,
      currency: movement.billing_currency ?? null,
      cardLast4: movement.card_last4 ?? null,
      sensitive: kind === "fournisseur_paye" ? "payment" : null,
      path: `/api/admin/pliant/${id}`,
    });

  try {
    if (body?.action === "ignore" || body?.action === "refuse" || body?.action === "outside") {
      await setOutgoingOutsideTrip("pliant", id, true, admin);
      revalidateTripAccounting(null);
      await journal("depense_hors_voyage", `Dépense Pliant${merchant ? ` ${merchant}` : ""} laissée hors voyage.`, null);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "restore") {
      await setOutgoingOutsideTrip("pliant", id, false, admin);
      revalidateTripAccounting(null);
      await journal("depense_hors_voyage", `Dépense Pliant${merchant ? ` ${merchant}` : ""} remise à pointer.`, null);
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
    await journal(
      "fournisseur_paye",
      `Fournisseur payé par carte Pliant${merchant ? ` : ${merchant}` : ""}${formatJournalAmount(amountCents, movement.billing_currency) ? `, ${formatJournalAmount(amountCents, movement.billing_currency)}` : ""}, rattaché au dossier.`,
      bookingId
    );
    return NextResponse.json({ cost });
  } catch (error) {
    if (error instanceof TripCostError) return jsonError(error.message, error.status);
    return jsonError("Rattachement impossible. Réessayez.", 400);
  }
}
