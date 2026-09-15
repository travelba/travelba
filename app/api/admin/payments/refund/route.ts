import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { getStripe } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin" && auth.staff.permissions?.finance !== true) return jsonError("Permission finance requise", 403);
  const stripe = getStripe();
  if (!stripe) return jsonError("Stripe non configuré", 503);
  const body = await request.json().catch(() => null);
  const transactionId = String(body?.transaction_id || "");
  const { data: transaction } = await auth.supabase
    .from("crm_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("source", "stripe")
    .eq("direction", "credit")
    .eq("status", "posted")
    .maybeSingle();
  if (!transaction?.external_id) return jsonError("Paiement Stripe remboursable introuvable", 404);
  const requestedAmount = body?.amount == null ? Number(transaction.amount) : Number(body.amount);
  const service = createServiceClient();
  const { data: priorRefunds, error: priorRefundsError } = await service
    .from("crm_transactions")
    .select("amount")
    .eq("related_transaction_id", transaction.id)
    .eq("kind", "refund")
    .eq("status", "posted");
  if (priorRefundsError) return jsonError(priorRefundsError.message, 500);
  const refundedAmount = (priorRefunds || []).reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );
  const refundableAmount = Math.max(0, Number(transaction.amount) - refundedAmount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > refundableAmount) {
    return jsonError(`Montant de remboursement invalide (maximum ${refundableAmount.toFixed(2)} ${transaction.currency})`);
  }
  const amountCents = Math.round(requestedAmount * 100);
  const refund = await stripe.refunds.create({
    payment_intent: transaction.external_id,
    amount: amountCents,
    metadata: { crm_transaction_id: transaction.id, crm_customer_id: transaction.customer_id },
  }, {
    idempotencyKey: `crm-refund/${transaction.id}/${Math.round(refundedAmount * 100)}/${amountCents}`,
  });

  const { error: auditError } = await service.from("crm_audit_events").insert({
    actor_user_id: auth.user.id,
    actor_staff_id: auth.staff.id,
    customer_id: transaction.customer_id,
    entity_type: "transaction",
    entity_id: transaction.id,
    action: "stripe_refund_requested",
    metadata: {
      stripe_refund_id: refund.id,
      amount: requestedAmount,
      status: refund.status,
    },
  });
  if (auditError) {
    console.error("Stripe refund audit failed", {
      refundId: refund.id,
      transactionId: transaction.id,
      error: auditError.message,
    });
  }

  let refundTx = null;
  if (refund.status === "succeeded") {
    const { data, error } = await service.rpc("crm_record_schedule_refund", {
      p_transaction_id: transaction.id,
      p_payment_intent_id: transaction.external_id,
      p_external_id: refund.id,
      p_amount: requestedAmount,
      p_occurred_on: new Date().toISOString().slice(0, 10),
    });
    if (error) {
      await service.from("crm_audit_events").insert({
        actor_user_id: auth.user.id,
        actor_staff_id: auth.staff.id,
        customer_id: transaction.customer_id,
        entity_type: "transaction",
        entity_id: transaction.id,
        action: "stripe_refund_reconciliation_failed",
        metadata: { stripe_refund_id: refund.id, error: error.message },
      });
      return jsonError(error.message, 500);
    }
    refundTx = data;
  }
  return NextResponse.json({ transaction: refundTx, refund_status: refund.status });
}
