import { NextResponse } from "next/server";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { appOrigin } from "@/lib/crm/invite";
import { removeColleague, resendColleagueAccess, setColleagueActive, setColleagueRole, StaffTeamError } from "@/lib/crm/staff-directory";
import { isUuid } from "@/lib/crm/ids";
import { parseStaffRole, STAFF_COPY, staffRoleLabel } from "@/lib/crm/staff-team";
import { createServiceClient } from "@/lib/supabase/admin";
import { revokeStaffSessions } from "@/lib/crm/staff-departure";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function teamError(err: unknown) {
  if (err instanceof StaffTeamError) return jsonError(err.message, err.status);
  console.error("[equipe] échec");
  return jsonError("Opération impossible. Réessayez.", 500);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  try {
    const result = await resendColleagueAccess(id, appOrigin(request));
    return NextResponse.json({ ok: true, delivered: result.delivered, link: result.link });
  } catch (err) {
    return teamError(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const body = await request.json().catch(() => null);
  if (typeof body?.active === "boolean") {
    try {
      const result = await setColleagueActive(id, body.active, auth.staff.id);
      if (!result.active) {
        // Couper l’accès ferme aussi les sessions ouvertes : le collègue ne reste pas connecté.
        const admin = createServiceClient({ allowPreview: true });
        const { data: row } = await admin.from("crm_staff").select("id, auth_user_id").eq("id", id).maybeSingle();
        if (row) await revokeStaffSessions(admin, row as { id: string; auth_user_id: string });
      }
      await recordAgencyJournal({
        staffId: auth.staff.id,
        action: "update",
        entityType: "user",
        entityId: id,
        summary: result.active ? "Accès rouvert." : "Accès coupé, sessions fermées.",
        diff: { actif: { avant: !result.active, apres: result.active } },
        path: `/api/admin/equipe/${id}`,
      });
      return NextResponse.json({ ok: true, active: result.active });
    } catch (err) {
      return teamError(err);
    }
  }
  const role = parseStaffRole(body?.role);
  if (!role) return jsonError(STAFF_COPY.role);
  try {
    const admin = createServiceClient({ allowPreview: true });
    const { data: before } = await admin.from("crm_staff").select("role, full_name").eq("id", id).maybeSingle();
    const previous = parseStaffRole((before as { role?: string } | null)?.role);
    const result = await setColleagueRole(id, role);
    const who = (before as { full_name?: string | null } | null)?.full_name || "Collègue";
    // Alerte informative aux administrateurs : le changement est déjà fait, rien n’est bloqué.
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "update",
      entityType: "user",
      entityId: id,
      summary: `Rôle de ${who} : ${previous ? staffRoleLabel(previous) : "?"} → ${staffRoleLabel(result.role)}.`,
      diff: { role: { avant: previous ? staffRoleLabel(previous) : null, apres: staffRoleLabel(result.role) } },
      sensitive: "role_change",
      path: `/api/admin/equipe/${id}`,
    });
    return NextResponse.json({ ok: true, role: result.role });
  } catch (err) {
    return teamError(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  try {
    await removeColleague(id, auth.staff.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamError(err);
  }
}
