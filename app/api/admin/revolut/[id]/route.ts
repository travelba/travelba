import { NextResponse } from "next/server";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { formatJournalAmount } from "@/lib/crm/agency-journal-kinds";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { applyRevolutToCustomer } from "@/lib/crm/revolut-match";
import { attachOutgoing, TripCostError } from "@/lib/crm/trip-costs-db";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmRevolutTransaction } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("crm_revolut_transactions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return jsonError("Mouvement introuvable", 404);
  const movement = row as CrmRevolutTransaction;

  const debit = movement.direction === "debit";
  const denied = await assertStaffPermission(auth.staff, debit ? "pay_supplier" : "edit_finances");
  if (denied) return denied;
  const amountCents = eurosToAlertCents(Number(movement.amount));
  const amountWords = formatJournalAmount(amountCents, movement.currency);
  const counterparty = (movement.counterparty_name || "").trim();

  if (body?.action === "ignore" || body?.action === "refuse") {
    if (movement.status === "matched") return jsonError("Déjà rapprochée");
    const patch =
      movement.direction === "debit"
        ? { status: "ignored", settled_at: new Date().toISOString() }
        : { status: "ignored" };
    const { error } = await admin.from("crm_revolut_transactions").update(patch).eq("id", id);
    if (error) return jsonError("Impossible de refuser ce mouvement.", 400);
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "finance",
      entityId: id,
      summary: `${debit ? "Sortie" : "Virement"} Revolut écarté${debit ? "e" : ""}${counterparty ? ` (${counterparty})` : ""}${amountWords ? `, ${amountWords}` : ""}.`,
      kind: debit ? "depense_hors_voyage" : "paiement_refuse",
      amountCents,
      currency: movement.currency,
      path: `/api/admin/revolut/${id}`,
    });
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
  if (movement.direction === "debit") {
    // Une sortie devient un coût du voyage désigné ; elle ne crédite ni ne débite le client.
    const bookingId = String(body?.booking_id || "");
    if (!isUuid(bookingId)) return jsonError("Choisissez la réservation.");
    try {
      const cost = await attachOutgoing(
        { source: "revolut", sourceId: id, bookingId, itemId: typeof body?.item_id === "string" ? body.item_id : null },
        admin
      );
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "finance",
        entityId: id,
        summary: `Fournisseur payé par virement Revolut${counterparty ? ` : ${counterparty}` : ""}${amountWords ? `, ${amountWords}` : ""}, rattaché au dossier.`,
        kind: "fournisseur_paye",
        bookingId,
        sensitive: "payment",
        amountCents,
        currency: movement.currency,
        path: `/api/admin/revolut/${id}`,
      });
      return NextResponse.json({ ok: true, cost });
    } catch (err) {
      if (err instanceof TripCostError) return jsonError(err.message, err.status);
      return jsonError("Rattachement impossible. Réessayez.", 400);
    }
  }
  if (!customerId) return jsonError("Client requis");
  const billingCompanyId = typeof body?.billing_company_id === "string" ? body.billing_company_id : null;
  const result = await applyRevolutToCustomer(admin, movement, customerId, billingCompanyId);
  if (!result.ok) {
    if (result.error === "already_matched") return jsonError("Déjà rapprochée");
    if (result.error === "not_a_credit") {
      return jsonError("Le rapprochement ne porte que sur les crédits reçus.");
    }
    if (result.error === "account_required") {
      return jsonError("Choisissez le compte : crédit ou Pro.");
    }
    return jsonError(result.error || "Rapprochement impossible", 400);
  }

  const posted = result.transaction as { booking_id?: string | null } | null;
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "update",
    entityType: "finance",
    entityId: id,
    summary: `Virement Revolut rapproché et crédité au client${counterparty ? ` (${counterparty})` : ""}${amountWords ? `, ${amountWords}` : ""}.`,
    kind: "paiement_rapproche",
    bookingId: posted?.booking_id ?? null,
    amountCents,
    currency: movement.currency,
    sensitive: "payment",
    path: `/api/admin/revolut/${id}`,
  });
  return NextResponse.json({ transaction: result.transaction });
}
