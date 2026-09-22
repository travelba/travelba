import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { creditRevolutToCustomer } from "@/lib/crm/revolut-match";
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

  if (body?.action === "ignore") {
    await admin
      .from("crm_revolut_transactions")
      .update({ status: "ignored" })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const customerId = String(body?.customer_id || "");
  if (!customerId) return jsonError("Client requis");
  const result = await creditRevolutToCustomer(
    admin,
    row as CrmRevolutTransaction,
    customerId
  );
  if (!result.ok) {
    if (result.error === "already_matched") return jsonError("Déjà rapproché");
    return jsonError(result.error || "Rapprochement impossible", 400);
  }

  return NextResponse.json({ transaction: result.transaction });
}
