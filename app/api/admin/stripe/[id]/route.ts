import { NextResponse } from "next/server";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { formatJournalAmount } from "@/lib/crm/agency-journal-kinds";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { applyStripeToCustomer, refuseStripeInbox } from "@/lib/crm/stripe-match";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmStripeTransaction } from "@/lib/crm/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient();
  const { data: row } = await admin.from("crm_stripe_transactions").select("*").eq("id", id).maybeSingle();
  if (!row) return jsonError("Paiement introuvable", 404);
  const movement = row as CrmStripeTransaction;
  const amountCents = eurosToAlertCents(Number(movement.amount));
  const amountWords = formatJournalAmount(amountCents, movement.currency);

  if (body?.action === "ignore" || body?.action === "refuse") {
    const refused = await refuseStripeInbox(admin, movement);
    if (!refused.ok) {
      if (refused.error === "already_matched") return jsonError("Déjà rapproché");
      return jsonError("Impossible de refuser ce paiement.", 400);
    }
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "finance",
      entityId: id,
      summary: `Paiement Stripe écarté${amountWords ? `, ${amountWords}` : ""}.`,
      kind: "paiement_refuse",
      amountCents,
      currency: movement.currency,
      path: `/api/admin/stripe/${id}`,
    });
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
  if (!customerId) return jsonError("Client requis");
  const result = await applyStripeToCustomer(admin, movement, customerId);
  if (!result.ok) {
    if (result.error === "already_matched") return jsonError("Déjà rapproché");
    if (result.error === "not_a_credit") {
      return jsonError("Le rapprochement ne porte que sur les crédits reçus.");
    }
    if (result.error === "already_credited") {
      return jsonError("Ce paiement est déjà crédité à un autre client.");
    }
    return jsonError("Rapprochement impossible. Réessayez.", 400);
  }
  const posted = result.transaction as { booking_id?: string | null } | null;
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "update",
    entityType: "finance",
    entityId: id,
    summary: `Paiement Stripe rapproché et crédité au client${amountWords ? `, ${amountWords}` : ""}.`,
    kind: "paiement_rapproche",
    bookingId: posted?.booking_id ?? null,
    amountCents,
    currency: movement.currency,
    sensitive: "payment",
    path: `/api/admin/stripe/${id}`,
  });
  return NextResponse.json({ transaction: result.transaction });
}
