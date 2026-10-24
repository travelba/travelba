import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { assertStaffPermission } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "reassign_dossier");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier introuvable.", 404);
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("id, owner_staff_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Dossier introuvable.", 404);
  const admin = createServiceClient({ allowPreview: true });
  const { data: people } = await admin
    .from("crm_staff")
    .select("id, full_name, role, active")
    .in("role", ["admin", "manager", "agent"])
    .order("full_name");
  const { data: links } = await admin.from("crm_booking_assignees").select("staff_id").eq("booking_id", id);
  return NextResponse.json({
    owner_staff_id: (booking as { owner_staff_id?: string | null }).owner_staff_id ?? null,
    assignee_ids: ((links || []) as { staff_id: string }[]).map((row) => row.staff_id),
    colleagues: ((people || []) as { id: string; full_name: string | null; active?: boolean }[])
      .filter((row) => row.active !== false)
      .map((row) => ({ id: row.id, name: row.full_name || "Collègue" })),
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const denied = await assertStaffPermission(auth.staff, "reassign_dossier");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier introuvable.", 404);
  const body = await request.json().catch(() => null);
  const owner = body?.owner_staff_id;
  const assignees = body?.assignee_ids;
  if (owner != null && owner !== "" && !isUuid(owner)) return jsonError("Agent introuvable.");
  if (assignees != null && (!Array.isArray(assignees) || assignees.some((value) => !isUuid(value)))) {
    return jsonError("Agents illisibles.");
  }
  const { data: booking } = await auth.supabase.from("crm_bookings").select("id, owner_staff_id").eq("id", id).maybeSingle();
  if (!booking) return jsonError("Dossier introuvable.", 404);
  const admin = createServiceClient({ allowPreview: true });
  const previous = (booking as { owner_staff_id?: string | null }).owner_staff_id ?? null;
  if (owner !== undefined) {
    const next = owner || null;
    const { error } = await admin.from("crm_bookings").update({ owner_staff_id: next }).eq("id", id);
    if (error) return jsonError("Le responsable n’a pas pu être enregistré.", 502);
  }
  if (Array.isArray(assignees)) {
    await admin.from("crm_booking_assignees").delete().eq("booking_id", id);
    if (assignees.length) {
      const { error } = await admin
        .from("crm_booking_assignees")
        .insert(assignees.map((staffId: string) => ({ booking_id: id, staff_id: staffId })));
      if (error) return jsonError("Les agents n’ont pas pu être enregistrés.", 502);
    }
  }
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "update",
    entityType: "dossier",
    entityId: id,
    summary: "Agent responsable modifié.",
    diff: { responsable: { avant: previous, apres: owner === undefined ? previous : owner || null } },
    path: `/api/admin/bookings/${id}/responsable`,
  });
  return NextResponse.json({ ok: true });
}
