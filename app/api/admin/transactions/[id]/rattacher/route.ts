import { NextResponse } from "next/server";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { attachPostedCredit } from "@/lib/crm/attach-credit";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { formatMoney } from "@/lib/crm/money";
import { payerKindOf } from "@/lib/crm/payer";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "edit_finances");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Crédit introuvable.", 404);
  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.booking_id === "string" ? body.booking_id : "";
  const payerKind = payerKindOf(body?.payer_kind);
  const companyId = typeof body?.billing_company_id === "string" ? body.billing_company_id : null;
  if (!isUuid(bookingId) || !payerKind) return jsonError("Choisissez le dossier et le payeur.");
  if (payerKind === "company" && !isUuid(companyId || "")) return jsonError("Choisissez la société.");
  const admin = createServiceClient();
  const result = await attachPostedCredit(admin, {
    id,
    bookingId,
    payerKind,
    companyId: payerKind === "company" ? companyId : null,
  });
  if (!result.ok) return jsonError(result.error, result.error.includes("introuvable") ? 404 : 400);
  if (!result.deja) {
    const money = formatMoney(result.montant, result.devise);
    const payeur = result.payeur === "company" ? "société" : "particulier";
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "finance",
      entityId: result.mouvement_id,
      summary: `Crédit rattaché · ${money} · ${result.reference} · ${payeur}`.slice(0, 500),
      sensitive: "payment",
      amountCents: eurosToAlertCents(result.montant),
      path: `/api/admin/transactions/${id}/rattacher`,
    });
  }
  return NextResponse.json({
    ok: true,
    deja: result.deja,
    mouvement_id: result.mouvement_id,
    dossier_id: result.dossier_id,
    payeur: result.payeur,
    societe_id: result.societe_id,
    montant: result.montant,
    devise: result.devise,
  });
}
