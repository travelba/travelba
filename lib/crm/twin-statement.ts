import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateFr, formatDateRangeShort } from "@/lib/crm/money";
import { formatStatementMoney, type StatementModel, type StatementStay } from "@/lib/crm/statement";
import { missingTwinTable, twinIdsOf } from "@/lib/crm/customer-twins";

type StayRow = {
  id: string;
  title: string | null;
  destination: string | null;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
  status?: string | null;
  currency?: string | null;
};

type MoveRow = {
  booking_id: string | null;
  customer_id?: string | null;
  direction?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  label?: string | null;
  occurred_on?: string | null;
  status?: string | null;
};

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function shownStay(row: StayRow) {
  return row.visible_to_client === true && !row.archived_at && row.status !== "cancelled";
}

/**
 * Dossiers montrés d’un jumeau, pour le relevé de celui qui consulte.
 * Les lignes déjà sur son grand livre ne sont pas reprises. L’encours ne change pas.
 */
export function sharedStatementStays(bookings: StayRow[], rows: MoveRow[], viewerId: string): StatementStay[] {
  const stays: StatementStay[] = [];
  for (const booking of bookings) {
    if (!booking.id || !shownStay(booking)) continue;
    const currency = (booking.currency || "EUR").toUpperCase();
    const moves = rows.filter(
      (row) =>
        row.booking_id === booking.id &&
        row.customer_id !== viewerId &&
        (!row.status || row.status === "posted") &&
        (row.direction === "debit" || row.direction === "credit")
    );
    let debit = 0;
    const lines = moves.map((row) => {
      const amount = Number(row.amount);
      const money = Number.isFinite(amount) ? formatStatementMoney(amount, row.currency || currency) : "";
      if (row.direction === "debit" && Number.isFinite(amount)) debit += amount;
      return {
        date: row.occurred_on ? formatDateFr(row.occurred_on) : "",
        title: (row.label || "").trim() || "Séjour",
        meta: booking.reference || null,
        debit: row.direction === "debit" ? money : "",
        credit: row.direction === "credit" ? money : "",
      };
    });
    const title = (booking.title || booking.destination || "Séjour").trim() || "Séjour";
    stays.push({
      title,
      meta: [formatDateRangeShort(booking.start_date, booking.end_date), booking.reference].filter(Boolean).join(" · "),
      amount: debit > 0 ? formatStatementMoney(roundMoney(debit), currency) : "",
      rows: lines,
    });
  }
  return stays;
}

/** Ajoute les dossiers partagés sans toucher à l’encours ni au nom du fichier. */
export function appendSharedStays(model: StatementModel, stays: StatementStay[]): StatementModel {
  const known = new Set(
    model.sections.flatMap((section) => section.stays.map((stay) => stay.meta).filter(Boolean))
  );
  const fresh = stays.filter((stay) => stay.meta && !known.has(stay.meta));
  if (!fresh.length) return model;
  return {
    ...model,
    sections: [...model.sections, { heading: "Dossiers partagés", stays: fresh, rows: [] }],
    emptyNote: null,
  };
}

/** Lecture service role des dossiers montrés des jumeaux. Vide si la table n’existe pas. */
export async function loadSharedStatementStays(admin: SupabaseClient, viewerId: string) {
  let twinIds: string[] = [];
  try {
    twinIds = await twinIdsOf(admin, viewerId);
  } catch {
    return [] as StatementStay[];
  }
  if (!twinIds.length) return [] as StatementStay[];
  const stays = await admin
    .from("crm_bookings")
    .select("id, title, destination, reference, start_date, end_date, visible_to_client, archived_at, status, currency")
    .in("customer_id", twinIds)
    .eq("visible_to_client", true)
    .is("archived_at", null);
  if (stays.error) {
    if (missingTwinTable(stays.error)) return [];
    return [];
  }
  const bookings = (stays.data || []) as StayRow[];
  const ids = bookings.map((row) => row.id).filter(Boolean);
  if (!ids.length) return [];
  const moves = await admin
    .from("crm_transactions")
    .select("booking_id, customer_id, direction, amount, currency, label, occurred_on, status")
    .in("booking_id", ids)
    .eq("status", "posted");
  const rows = moves.error ? [] : ((moves.data || []) as MoveRow[]);
  return sharedStatementStays(bookings, rows, viewerId);
}
