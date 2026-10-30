import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { isUuid } from "@/lib/crm/ids";
import { STAFF_COPY } from "@/lib/crm/staff-team";
import { createServiceClient } from "@/lib/supabase/admin";
import { revokeStaffSessions } from "@/lib/crm/staff-departure";
import { StaffTeamError } from "@/lib/crm/staff-directory";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const admin = createServiceClient({ allowPreview: true });
  const { data, error } = await admin
    .from("crm_staff_sessions")
    .select("id, session_id, ip, user_agent, created_at, last_seen_at, revoked_at")
    .eq("staff_id", id)
    .order("last_seen_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ sessions: [] });
  return NextResponse.json({
    sessions: ((data || []) as { session_id: string }[]).map((row) => ({
      ...row,
      session_id: row.session_id.slice(0, 8),
    })),
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(STAFF_COPY.notFound, 404);
  const admin = createServiceClient({ allowPreview: true });
  const { data: staff, error } = await admin
    .from("crm_staff")
    .select("id, auth_user_id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (error || !staff) return jsonError(STAFF_COPY.notFound, 404);
  const row = staff as { id: string; auth_user_id: string; full_name: string | null };
  try {
    await revokeStaffSessions(admin, row);
  } catch (err) {
    if (err instanceof StaffTeamError) return jsonError(err.message, err.status);
    return jsonError("Les sessions n’ont pas pu être fermées.", 502);
  }
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "logout",
    entityType: "session",
    entityId: id,
    summary: "Sessions fermées.",
    path: `/api/admin/equipe/${id}/sessions`,
  });
  return NextResponse.json({ ok: true });
}
