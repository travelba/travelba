import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { sanitizeMatrixUpdate } from "@/lib/crm/agency-access";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function wholeEuros(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return null;
  return Math.round(amount);
}

function wholeCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 50) return null;
  return count;
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "change_settings");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const admin = createServiceClient({ allowPreview: true });

  if (Array.isArray(body?.updates)) {
    const updates = sanitizeMatrixUpdate(body.updates);
    if (!updates) return jsonError("Matrice illisible.");
    if (updates.length) {
      const { error } = await admin.from("crm_role_permissions").upsert(updates, { onConflict: "role,permission" });
      if (error) return jsonError("Les droits n’ont pas pu être enregistrés.", 502);
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "setting",
        summary: "Matrice des droits enregistrée.",
        diff: { droits: updates },
        path: "/api/admin/equipe/droits",
      });
    }
  }

  const payment = body?.payment_euros == null ? null : wholeEuros(body.payment_euros);
  const failed = body?.failed_logins == null ? null : wholeCount(body.failed_logins);
  if (body?.payment_euros != null && payment == null) return jsonError("Seuil illisible.");
  if (body?.failed_logins != null && failed == null) return jsonError("Seuil de connexions illisible.");
  if (payment != null || failed != null) {
    const patch: Record<string, number> = { id: 1 };
    if (payment != null) patch.payment_alert_cents = payment * 100;
    if (failed != null) patch.failed_login_alert_count = failed;
    const { error } = await admin.from("crm_agency_settings").upsert(patch);
    if (error) return jsonError("Les seuils d’alerte n’ont pas pu être enregistrés.", 502);
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "setting",
      summary: "Seuils d’alerte enregistrés.",
      diff: {
        seuil_paiement_euros: payment,
        connexions_refusees: failed,
      },
      path: "/api/admin/equipe/droits",
    });
  }

  return NextResponse.json({ ok: true });
}
