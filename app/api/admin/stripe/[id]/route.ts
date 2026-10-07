import { NextResponse } from "next/server";
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

  if (body?.action === "ignore" || body?.action === "refuse") {
    const refused = await refuseStripeInbox(admin, movement);
    if (!refused.ok) {
      if (refused.error === "already_matched") return jsonError("Déjà rapproché");
      return jsonError("Impossible de refuser ce paiement.", 400);
    }
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
  return NextResponse.json({ transaction: result.transaction });
}
