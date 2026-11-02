import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { responsableChangeAllowed, responsableChangeSummary } from "@/lib/crm/agency-access";
import { staffAllows } from "@/lib/crm/agency-guard";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { loadAssignableColleagues, loadDossierPeople, loadStaffNames } from "@/lib/crm/dossier-responsables";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type BookingRow = { id: string; reference: string; owner_staff_id?: string | null; created_by_staff_id?: string | null };

async function readBooking(admin: ReturnType<typeof createServiceClient>, id: string): Promise<BookingRow | null> {
  const first = await admin
    .from("crm_bookings")
    .select("id, reference, owner_staff_id, created_by_staff_id")
    .eq("id", id)
    .maybeSingle();
  if (!first.error) return (first.data as BookingRow | null) ?? null;
  // Colonnes absentes avant la migration : le dossier reste lisible, sans responsable.
  const second = await admin.from("crm_bookings").select("id, reference").eq("id", id).maybeSingle();
  return (second.data as BookingRow | null) ?? null;
}

/** Créé par, En charge, Intervenants, et ce que le collègue connecté peut faire. Ouvert à toute l’agence. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier introuvable.", 404);
  const admin = createServiceClient({ allowPreview: true });
  const booking = await readBooking(admin, id);
  if (!booking) return jsonError("Dossier introuvable.", 404);
  const [people, colleagues, canAssign, canTake] = await Promise.all([
    loadDossierPeople(admin, booking),
    loadAssignableColleagues(admin),
    staffAllows(auth.staff, "reassign_dossier"),
    staffAllows(auth.staff, "edit_dossiers"),
  ]);
  return NextResponse.json({
    me: auth.staff.id,
    created_by: people.createdBy,
    owner: people.owner,
    intervenants: people.intervenants,
    colleagues: colleagues.map((row) => ({ id: row.id, name: row.name })),
    can_assign: canAssign,
    can_take: canTake,
  });
}

/**
 * `{ action: "prendre" }` : le collègue se met en charge. `{ owner_staff_id }` : un administrateur attribue
 * (null remet le dossier à prendre). Chaque changement est une ligne d’Historique, avant → après.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier introuvable.", 404);
  const body = (await request.json().catch(() => null)) as { action?: unknown; owner_staff_id?: unknown } | null;
  const selfTake = body?.action === "prendre";
  const requested = body?.owner_staff_id;
  if (!selfTake && requested !== null && requested !== "" && !(typeof requested === "string" && isUuid(requested))) {
    return jsonError("Collègue introuvable.");
  }
  const nextOwnerId = selfTake ? auth.staff.id : typeof requested === "string" && requested ? requested : null;

  const [canAssign, canEdit] = await Promise.all([
    staffAllows(auth.staff, "reassign_dossier"),
    staffAllows(auth.staff, "edit_dossiers"),
  ]);
  const allowed = responsableChangeAllowed({ actorId: auth.staff.id, canReassign: canAssign, canEdit, nextOwnerId });
  if (!allowed.ok) return jsonError(allowed.message, 403);

  const admin = createServiceClient({ allowPreview: true });
  const booking = await readBooking(admin, id);
  if (!booking) return jsonError("Dossier introuvable.", 404);
  const previousId = booking.owner_staff_id ?? null;

  if (nextOwnerId) {
    const colleagues = await loadAssignableColleagues(admin);
    if (!colleagues.some((row) => row.id === nextOwnerId)) return jsonError("Ce collègue ne peut pas être en charge.");
  }

  const { error } = await admin.from("crm_bookings").update({ owner_staff_id: nextOwnerId }).eq("id", id);
  if (error) return jsonError("Le responsable n’a pas pu être enregistré.", 502);

  const names = await loadStaffNames(admin, [previousId, nextOwnerId]);
  const previousName = previousId ? names.get(previousId) || "Collègue" : null;
  const nextName = nextOwnerId ? names.get(nextOwnerId) || "Collègue" : null;
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "update",
    entityType: "dossier",
    entityId: id,
    summary: responsableChangeSummary({ previousName, nextName, selfTake }),
    diff: { en_charge: { avant: previousName || "À prendre", apres: nextName || "À prendre" } },
    path: `/api/admin/bookings/${id}/responsable`,
  });
  return NextResponse.json({
    ok: true,
    owner: nextOwnerId ? { id: nextOwnerId, name: nextName } : null,
  });
}
