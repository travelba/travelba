import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import {
  generateGroupedInvoice,
  groupedPublicPreview,
  loadGroupedDesk,
  previewGroupedInvoice,
  removeGroupedInvoice,
  restoreGroupedInvoice,
} from "@/lib/crm/grouped-invoice-run";
import { formatMoney } from "@/lib/crm/money";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function money(amount: number) {
  return formatMoney(amount, "EUR");
}

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Client introuvable.", 404);
  const desk = await loadGroupedDesk(auth.supabase, id);
  if (!desk.ok) return jsonError(desk.error, desk.status);
  return NextResponse.json({
    avertissement: desk.data.avertissement,
    payeurs: desk.data.payers,
    factures: desk.data.factures.map((row) => ({
      ...row,
      totalLabel: money(row.total),
      paidLabel: money(row.paid),
      balanceLabel: money(row.balance),
    })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Client introuvable.", 404);
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    dossier_ids?: string[];
    facture_id?: string;
  } | null;
  const action = (body?.action || "").trim();
  const actor = { staffId: auth.staff.id, name: auth.staff.full_name || "Agence" };
  if (action === "retirer" || action === "restaurer") {
    const factureId = (body?.facture_id || "").trim();
    const result =
      action === "retirer"
        ? await removeGroupedInvoice(auth.supabase, id, factureId, actor)
        : await restoreGroupedInvoice(auth.supabase, id, factureId, actor);
    if (!result.ok) return jsonError(result.error, result.status);
    return NextResponse.json({ ok: true, numero: result.data.number, envoye: false });
  }
  const ids = Array.isArray(body?.dossier_ids) ? body.dossier_ids.map((value) => String(value)) : [];
  if (action === "apercu") {
    const preview = await previewGroupedInvoice(auth.supabase, id, ids);
    if (!preview.ok) return jsonError(preview.error, preview.status);
    return NextResponse.json(groupedPublicPreview(preview.data.document));
  }
  if (action === "generer") {
    const created = await generateGroupedInvoice(auth.supabase, id, ids, actor, body?.facture_id);
    if (!created.ok) return jsonError(created.error, created.status);
    return NextResponse.json({
      ok: true,
      envoye: false,
      pro_forma: true,
      id: created.data.id,
      numero: created.data.number,
      fichier: created.data.fichier,
      total: created.data.document.totalLabel,
      paye: created.data.document.paidLabel,
      reste: created.data.document.balanceLabel,
    });
  }
  return jsonError("Action inconnue.", 400);
}
