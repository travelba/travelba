import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";

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
  if (!row) return jsonError("Virement introuvable", 404);

  if (body?.action === "ignore") {
    await admin
      .from("crm_revolut_transactions")
      .update({ status: "ignored" })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
  if (!customerId) return jsonError("Client requis");
  if (row.status === "matched") return jsonError("Déjà rapproché");

  const { data: tx, error } = await admin
    .from("crm_transactions")
    .insert({
      customer_id: customerId,
      direction: "credit",
      kind: "transfer",
      amount: row.amount,
      currency: row.currency,
      occurred_on: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
      label:
        row.reference ||
        `Virement Revolut ${row.counterparty_name || ""}`.trim(),
      source: "revolut",
      external_id: row.revolut_transaction_id,
      status: "posted",
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);

  await admin
    .from("crm_revolut_transactions")
    .update({
      status: "matched",
      matched_customer_id: customerId,
      matched_transaction_id: tx.id,
    })
    .eq("id", id);

  return NextResponse.json({ transaction: tx });
}
