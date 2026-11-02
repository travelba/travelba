/**
 * Créé par, En charge, Intervenants d’un dossier. Service role : la lecture sert tous les rôles de l’agence.
 * Les intervenants viennent du journal d’agence (qui a agi sur le dossier), sans ligne supplémentaire.
 * Un dossier sans responsable reste « À prendre » : rien n’est attribué à la place de l’agence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { dossierIntervenants, type DossierPerson } from "@/lib/crm/agency-access";
import { isAgencyRole } from "@/lib/crm/agency-access";
import type { StaffRole } from "@/lib/crm/staff-team";

export type DossierPeople = {
  createdBy: DossierPerson | null;
  owner: DossierPerson | null;
  intervenants: DossierPerson[];
};

type StaffRow = { id: string; full_name: string | null; role: string; active?: boolean | null };

export async function loadStaffNames(admin: SupabaseClient, ids: readonly (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await admin.from("crm_staff").select("id, full_name").in("id", unique);
  for (const row of (data || []) as { id: string; full_name: string | null }[]) {
    names.set(row.id, row.full_name || "Collègue");
  }
  return names;
}

/** Collègues qui peuvent être en charge d’un dossier : rôles de l’agence, accès ouvert, hors lecture seule. */
export async function loadAssignableColleagues(admin: SupabaseClient): Promise<(DossierPerson & { role: StaffRole })[]> {
  const { data } = await admin.from("crm_staff").select("id, full_name, role, active").order("full_name");
  return ((data || []) as StaffRow[])
    .filter((row) => isAgencyRole(row.role) && row.role !== "lecture" && row.active !== false)
    .map((row) => ({ id: row.id, name: row.full_name || "Collègue", role: row.role as StaffRole }));
}

export async function loadDossierPeople(
  admin: SupabaseClient,
  booking: { id: string; owner_staff_id?: string | null; created_by_staff_id?: string | null }
): Promise<DossierPeople> {
  const ownerId = booking.owner_staff_id ?? null;
  const createdById = booking.created_by_staff_id ?? null;
  let journalStaffIds: (string | null)[] = [];
  try {
    const { data } = await admin
      .from("crm_agency_journal")
      .select("staff_id")
      .eq("entity_type", "dossier")
      .eq("entity_id", booking.id)
      .order("seq", { ascending: false })
      .limit(500);
    journalStaffIds = ((data || []) as { staff_id: string | null }[]).map((row) => row.staff_id);
  } catch {
    journalStaffIds = [];
  }
  const names = await loadStaffNames(admin, [...journalStaffIds, ownerId, createdById]);
  return {
    createdBy: createdById ? { id: createdById, name: names.get(createdById) || "Collègue" } : null,
    owner: ownerId ? { id: ownerId, name: names.get(ownerId) || "Collègue" } : null,
    intervenants: dossierIntervenants({ journalStaffIds, createdById, ownerId, names }),
  };
}

/**
 * Pose « Créé par » sur un dossier qui vient d’être créé par l’agence, et la ligne d’Historique « Dossier créé. ».
 * Avant la migration, la colonne manque : le dossier reste créé, sans créateur. Jamais de responsable posé ici.
 */
export async function stampBookingCreator(
  admin: SupabaseClient,
  input: { bookingId: string; staffId: string; path: string; summary?: string }
) {
  try {
    await admin
      .from("crm_bookings")
      .update({ created_by_staff_id: input.staffId })
      .eq("id", input.bookingId)
      .is("created_by_staff_id", null);
  } catch {
    /* colonne absente : la création n’est pas refusée */
  }
  const { recordAgencyJournal } = await import("@/lib/crm/agency-log");
  await recordAgencyJournal({
    staffId: input.staffId,
    action: "create",
    entityType: "dossier",
    entityId: input.bookingId,
    summary: input.summary || "Dossier créé.",
    path: input.path,
  });
}

/** Noms des responsables pour une liste de dossiers : `{ [bookingId]: "Marie" }`. Sans responsable, absent. */
export async function ownerLabelsFor(
  admin: SupabaseClient,
  bookings: readonly { id: string; owner_staff_id?: string | null }[]
): Promise<Record<string, string>> {
  const names = await loadStaffNames(
    admin,
    bookings.map((row) => row.owner_staff_id)
  );
  const labels: Record<string, string> = {};
  for (const row of bookings) {
    const name = row.owner_staff_id ? names.get(row.owner_staff_id) : null;
    if (name) labels[row.id] = name;
  }
  return labels;
}
