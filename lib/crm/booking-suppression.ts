import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmationRefsAlign, referenceTokens } from "@/lib/crm/email-match";

export type SuppressionRow = {
  reference?: string | null;
  confirmation_refs?: string[] | null;
  le_booking_ids?: number[] | null;
};

/** Une suppression volontaire bloque la recréation du même séjour. */
export function suppressionMatches(row: SuppressionRow, refs: string[], leIds: number[] = []) {
  const wanted = new Set(leIds.filter((id) => Number.isInteger(id)));
  for (const id of row.le_booking_ids || []) {
    if (wanted.has(Number(id))) return true;
  }
  const stored = [row.reference || "", ...(row.confirmation_refs || [])];
  return refs.some((ref) => stored.some((token) => confirmationRefsAlign(ref, token) || referenceTokens(ref).some((part) => referenceTokens(token).includes(part))));
}

export const SUPPRESSED_DOSSIER =
  "Ce dossier a été supprimé. Il n’est pas recréé.";

export async function loadSuppressions(admin: SupabaseClient): Promise<SuppressionRow[]> {
  const { data, error } = await admin
    .from("crm_booking_suppressions")
    .select("reference, confirmation_refs, le_booking_ids");
  if (error) return [];
  return (data || []) as SuppressionRow[];
}

export async function recordBookingSuppression(
  admin: SupabaseClient,
  input: { reference: string | null; confirmationRefs: string[]; leBookingIds: number[] }
) {
  const confirmation_refs = [...new Set(input.confirmationRefs.map((ref) => ref.trim()).filter(Boolean))];
  const le_booking_ids = [...new Set(input.leBookingIds.filter((id) => Number.isInteger(id)))];
  if (!input.reference && !confirmation_refs.length && !le_booking_ids.length) return;
  const { error } = await admin.from("crm_booking_suppressions").insert({
    reference: input.reference,
    confirmation_refs,
    le_booking_ids,
  });
  if (error) throw new Error("La suppression du dossier n’a pas pu être retenue.");
}
