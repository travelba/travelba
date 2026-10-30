/**
 * Départ d’un collègue : couper l’accès (sessions fermées, compte banni) et réattribuer
 * ses dossiers en charge à un collègue. Service role. Chaque dossier réattribué a sa ligne d’Historique.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { loadStaffNames } from "@/lib/crm/dossier-responsables";
import { setColleagueActive, StaffTeamError } from "@/lib/crm/staff-directory";

export async function countOwnedBookings(admin: SupabaseClient, staffId: string) {
  const { count, error } = await admin
    .from("crm_bookings")
    .select("id", { count: "exact", head: true })
    .eq("owner_staff_id", staffId)
    .is("archived_at", null);
  if (error) return 0;
  return count ?? 0;
}

/** Ferme toutes les sessions du collègue : lignes `crm_staff_sessions` et horodatage dans le JWT. */
export async function revokeStaffSessions(admin: SupabaseClient, staff: { id: string; auth_user_id: string }) {
  const now = new Date().toISOString();
  await admin.from("crm_staff_sessions").update({ revoked_at: now }).eq("staff_id", staff.id).is("revoked_at", null);
  const { data: userData } = await admin.auth.admin.getUserById(staff.auth_user_id);
  const meta = { ...(userData.user?.app_metadata || {}), sessions_revoked_at: now };
  const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, { app_metadata: meta });
  if (error) throw new StaffTeamError("Les sessions n’ont pas pu être fermées.", 502);
  return now;
}

/**
 * Réattribue les dossiers en charge (non archivés) de `fromId` à `toId` (null : à prendre).
 * Renvoie le nombre de dossiers déplacés. Une ligne d’Historique par dossier.
 */
export async function reassignOwnedBookings(
  admin: SupabaseClient,
  input: { fromId: string; toId: string | null; actorId: string; reason: "depart" | "reattribution" }
) {
  const { data, error } = await admin
    .from("crm_bookings")
    .select("id, reference")
    .eq("owner_staff_id", input.fromId)
    .is("archived_at", null);
  if (error) throw new StaffTeamError("Les dossiers n’ont pas pu être lus.", 502);
  const rows = (data || []) as { id: string; reference: string }[];
  if (!rows.length) return 0;
  const { error: updateError } = await admin
    .from("crm_bookings")
    .update({ owner_staff_id: input.toId })
    .in(
      "id",
      rows.map((row) => row.id)
    );
  if (updateError) throw new StaffTeamError("Les dossiers n’ont pas pu être réattribués.", 502);
  const names = await loadStaffNames(admin, [input.fromId, input.toId]);
  const fromName = names.get(input.fromId) || "Collègue";
  const toName = input.toId ? names.get(input.toId) || "Collègue" : "À prendre";
  for (const row of rows) {
    await recordAgencyJournal({
      staffId: input.actorId,
      action: "update",
      entityType: "dossier",
      entityId: row.id,
      summary:
        input.reason === "depart"
          ? `En charge : ${fromName} → ${toName} (départ de ${fromName}).`
          : `En charge : ${fromName} → ${toName}.`,
      diff: { en_charge: { avant: fromName, apres: toName } },
      path: `/api/admin/equipe/${input.fromId}/depart`,
    });
  }
  return rows.length;
}

export async function departColleague(
  admin: SupabaseClient,
  input: { staffId: string; actorId: string; reassignTo: string | null; cutAccess: boolean }
) {
  const { data: staff, error } = await admin
    .from("crm_staff")
    .select("id, auth_user_id, full_name, role")
    .eq("id", input.staffId)
    .maybeSingle();
  if (error || !staff) throw new StaffTeamError("Collègue introuvable.", 404);
  const row = staff as { id: string; auth_user_id: string; full_name: string | null; role: string };
  if (input.reassignTo === row.id) throw new StaffTeamError("Choisissez un autre collègue.");

  if (input.cutAccess) {
    await setColleagueActive(row.id, false, input.actorId);
    await revokeStaffSessions(admin, row);
    await recordAgencyJournal({
      staffId: input.actorId,
      action: "logout",
      entityType: "user",
      entityId: row.id,
      summary: `Départ : accès coupé et sessions fermées (${row.full_name || "collègue"}).`,
      diff: { actif: { avant: true, apres: false } },
      path: `/api/admin/equipe/${row.id}/depart`,
    });
  }
  const moved = await reassignOwnedBookings(admin, {
    fromId: row.id,
    toId: input.reassignTo,
    actorId: input.actorId,
    reason: input.cutAccess ? "depart" : "reattribution",
  });
  return { moved, name: row.full_name || "Collègue" };
}
