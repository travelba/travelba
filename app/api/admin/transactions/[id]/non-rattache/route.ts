import { NextResponse } from "next/server";
import { eurosToAlertCents } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { unmatchClientCredit, type UnmatchJournalEntry } from "@/lib/crm/unmatch-credit";
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
  const motif = typeof body?.motif === "string" ? body.motif : "";
  const admin = createServiceClient();
  const result = await unmatchClientCredit(
    admin,
    { id, motif },
    {
      actor: { staffId: auth.staff.id, label: "agence" },
      path: `/api/admin/transactions/${id}/non-rattache`,
      journal: (entry) => writeJournal(entry),
    }
  );
  if (!result.ok) return jsonError(result.error, result.error.includes("introuvable") ? 404 : 400);
  return NextResponse.json({
    ok: true,
    mouvement_id: result.mouvement_id,
    client_id: result.client_id,
    montant: result.montant,
    devise: result.devise,
    source: result.source,
    file: result.file,
    deja: result.deja,
  });
}

function writeJournal(entry: UnmatchJournalEntry) {
  return recordAgencyJournal({
    staffId: entry.staffId,
    action: "update",
    entityType: "finance",
    entityId: entry.entityId,
    summary: entry.summary,
    diff: entry.diff,
    amountCents: entry.amountCents ?? eurosToAlertCents(Number(entry.diff.montant)),
    sensitive: "payment",
    path: entry.path,
  });
}
