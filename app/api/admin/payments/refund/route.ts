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
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > Number(transaction.amount)) return jsonError("Montant de remboursement invalide");
  const amountCents = Math.round(requestedAmount * 100);
  const refund = await stripe.refunds.create({
    payment_intent: transaction.external_id,
    amount: amountCents,
    metadata: { crm_transaction_id: transaction.id, crm_customer_id: transaction.customer_id },
  }, { idempotencyKey: `crm-refund/${transaction.id}/${amountCents}` });
  const service = createServiceClient();
  const { data: refundTx, error } = await service.from("crm_transactions").upsert({
    customer_id: transaction.customer_id,
    booking_id: transaction.booking_id,
    direction: "debit",
    kind: "refund",
    amount: requestedAmount,
    currency: transaction.currency,
    occurred_on: new Date().toISOString().slice(0, 10),
    label: `Remboursement ${transaction.label}`,
    source: "stripe",
    external_id: refund.id,
    status: refund.status === "failed" || refund.status === "canceled" ? "void" : "posted",
  }, { onConflict: "source,external_id" }).select("*").single();
  if (error) return jsonError(error.message, 500);
  await service.from("crm_audit_events").insert({ actor_user_id: auth.user.id, actor_staff_id: auth.staff.id, customer_id: transaction.customer_id, entity_type: "transaction", entity_id: refundTx.id, action: "stripe_refund", metadata: { original_transaction_id: transaction.id, stripe_refund_id: refund.id } });
  return NextResponse.json({ transaction: refundTx, refund_status: refund.status });
}
