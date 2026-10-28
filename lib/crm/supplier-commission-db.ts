import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readCommission,
  type CommissionColumns,
  type CommissionQueueStatus,
  type SupplierCommission,
} from "./supplier-commission";

export type CommissionQueueLine = {
  booking_item_id: string;
  booking_id: string;
  reference: string | null;
  dossier_titre: string | null;
  title: string | null;
  supplier: string | null;
  kind: string | null;
  commission_attendue: number | string | null;
  commission_taux: number | string | null;
  commission_date_prevue: string | null;
  commission_recue: number | string | null;
  commission_recue_le: string | null;
  statut: CommissionQueueStatus;
};

export type CommissionQueue = {
  disponible: boolean;
  attendues: number;
  en_retard: number;
  recues: number;
  lignes: CommissionQueueLine[];
};

const EMPTY: CommissionQueue = { disponible: false, attendues: 0, en_retard: 0, recues: 0, lignes: [] };

/** File « commissions à recevoir ». Vide si la vue n’est pas encore en place. */
export async function loadCommissionQueue(
  admin: SupabaseClient,
  filtre?: CommissionQueueStatus | null
): Promise<CommissionQueue> {
  const { data, error } = await admin
    .from("crm_commissions_a_recevoir")
    .select(
      "booking_item_id, booking_id, reference, dossier_titre, title, supplier, kind, commission_attendue, commission_taux, commission_date_prevue, commission_recue, commission_recue_le, statut"
    )
    .order("commission_date_prevue", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) return EMPTY;
  const lignes = (data || []) as CommissionQueueLine[];
  const count = (status: CommissionQueueStatus) => lignes.filter((row) => row.statut === status).length;
  const shown = filtre ? lignes.filter((row) => row.statut === filtre) : lignes;
  return {
    disponible: true,
    attendues: count("attendue"),
    en_retard: count("en_retard"),
    recues: count("recue"),
    lignes: shown.slice(0, 40),
  };
}

/** Colonnes de commission d’un dossier. Carte vide si la migration n’est pas jouée. */
export async function loadBookingCommissions(admin: SupabaseClient, bookingId: string) {
  const map = new Map<string, SupplierCommission>();
  const { data: items, error: itemError } = await admin
    .from("crm_booking_items")
    .select("id")
    .eq("booking_id", bookingId);
  if (itemError) return map;
  const ids = ((items || []) as { id: string }[]).map((row) => row.id);
  if (!ids.length) return map;
  const { data, error } = await admin
    .from("crm_booking_item_commissions")
    .select("booking_item_id, commission_attendue, commission_taux, commission_date_prevue, commission_recue, commission_recue_le")
    .in("booking_item_id", ids);
  if (error) return map;
  for (const row of (data || []) as {
    booking_item_id: string;
    commission_attendue?: unknown;
    commission_taux?: unknown;
    commission_date_prevue?: unknown;
    commission_recue?: unknown;
    commission_recue_le?: unknown;
  }[]) {
    map.set(row.booking_item_id, readCommission(row));
  }
  return map;
}

export async function loadItemCommission(admin: SupabaseClient, itemId: string) {
  const { data, error } = await admin
    .from("crm_booking_item_commissions")
    .select("commission_attendue, commission_taux, commission_date_prevue, commission_recue, commission_recue_le")
    .eq("booking_item_id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  return readCommission(data);
}

/** Enregistre la commission à part de la carte. Une ligne vide est retirée. */
export async function saveItemCommission(
  admin: SupabaseClient,
  itemId: string,
  columns: Partial<CommissionColumns>
) {
  if (!Object.keys(columns).length) return;
  const { data: current, error: readError } = await admin
    .from("crm_booking_item_commissions")
    .select("commission_attendue, commission_taux, commission_date_prevue, commission_recue, commission_recue_le")
    .eq("booking_item_id", itemId)
    .maybeSingle();
  if (readError) throw new Error(readError.message || "Commission illisible.");
  const next = { ...(current || {}), ...columns };
  const empty =
    next.commission_attendue == null &&
    next.commission_taux == null &&
    next.commission_date_prevue == null &&
    next.commission_recue == null &&
    next.commission_recue_le == null;
  if (empty) {
    if (!current) return;
    const { error } = await admin.from("crm_booking_item_commissions").delete().eq("booking_item_id", itemId);
    if (error) throw new Error(error.message || "Commission non retirée.");
    return;
  }
  const { error } = await admin.from("crm_booking_item_commissions").upsert(
    { booking_item_id: itemId, ...columns },
    { onConflict: "booking_item_id" }
  );
  if (error) throw new Error(error.message || "Commission non enregistrée.");
}
