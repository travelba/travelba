import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { applyRevolutToCustomer } from "@/lib/crm/revolut-match";
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
  if (!row) return jsonError("Virement introuvable", 404);
  const movement = row as CrmRevolutTransaction;

  if (body?.action === "ignore" || body?.action === "refuse") {
    if (movement.status === "matched") return jsonError("Déjà rapprochée");
    const { error } = await admin
      .from("crm_revolut_transactions")
      .update({ status: "ignored" })
      .eq("id", id);
    if (error) return jsonError("Impossible de refuser ce mouvement.", 400);
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
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

  return NextResponse.json({ transaction: result.transaction });
}
