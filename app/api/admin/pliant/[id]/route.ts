import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { applyPliantToCustomer, type PliantLedgerRow } from "@/lib/crm/pliant-match";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("crm_pliant_transactions")
    .select(
      "id, pliant_transaction_id, card_id, type, status, merchant, billing_cents, billing_currency, booked_at, card_label, card_last4, match_status"
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return jsonError("Dépense introuvable", 404);
  const movement = row as PliantLedgerRow;

  if (body?.action === "ignore" || body?.action === "refuse") {
    if (movement.match_status === "matched") return jsonError("Déjà rapprochée");
    await admin.from("crm_pliant_transactions").update({ match_status: "ignored" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
  if (!customerId) return jsonError("Client requis");
  const result = await applyPliantToCustomer(admin, movement, customerId);
  if (!result.ok) {
    if (result.error === "already_matched") return jsonError("Déjà rapprochée");
    if (result.error === "not_postable") {
      return jsonError("Cette dépense n’est pas comptabilisée.");
    }
    return jsonError("Rapprochement impossible. Réessayez.", 400);
  }
  return NextResponse.json({ transaction: result.transaction });
}
