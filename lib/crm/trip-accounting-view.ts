import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mb3mRealm } from "./mb3m";
import { mb3mDossierLines, mb3mPieceStale, type Mb3mLedgerRow } from "./mb3m-account";
import { isStayAmountKind } from "./bookings";
import {
  accountLines,
  marginByTransaction,
  saleLines,
  tripAccountingState,
  tripTotals,
  type SaleLedgerRow,
  type TripAccountingView,
  type TripCost,
} from "./trip-costs";
import { loadDossierPendingCosts } from "./pliant-dossier-run";
import { loadOutgoingQueue, loadTripCosts } from "./trip-costs-db";
import { readCommission } from "./supplier-commission";

export type PieceRow = {
  id: string;
  piece_number: string | null;
  printed_at: string | null;
  credited_at: string | null;
  transaction_ids: string[] | null;
  line_signature: string | null;
  amount: number | string | null;
};

export type DossierAccountingInputs = {
  charges: (Mb3mLedgerRow & SaleLedgerRow)[];
  pieces: PieceRow[];
  costs: TripCost[];
  /** Ids couverts par une facture imprimée encore valable (pas d’avoir). */
  coveredIds: string[];
  /** Pro forma ouverte (numérotée, non imprimée). */
  openNumber: string | null;
};

/** Ventes, pièces MB3M et coûts d’un dossier : une seule lecture pour la facture et le bloc. */
export async function loadDossierAccountingInputs(admin: SupabaseClient, bookingId: string): Promise<DossierAccountingInputs> {
  const [debits, pieces, costs] = await Promise.all([
    admin
      .from("crm_transactions")
      .select("id, direction, status, currency, amount, label, external_id, booking_id, kind")
      .eq("booking_id", bookingId)
      .eq("status", "posted")
      .eq("direction", "debit"),
    admin
      .from("crm_mb3m_pieces")
      .select("id, piece_number, printed_at, credited_at, transaction_ids, line_signature, amount")
      .eq("booking_id", bookingId)
      .eq("kind", "invoice")
      .eq("realm", mb3mRealm()),
    loadTripCosts(bookingId, admin),
  ]);
  const rows = (pieces.data || []) as PieceRow[];
  const valid = rows.filter((row) => row.printed_at && !row.credited_at);
  const open = rows.find((row) => !row.printed_at && (row.piece_number || "").trim());
  return {
    charges: (debits.data || []) as (Mb3mLedgerRow & SaleLedgerRow)[],
    pieces: rows,
    costs,
    coveredIds: valid.flatMap((row) => row.transaction_ids || []),
    openNumber: open?.piece_number?.trim() || null,
  };
}

/** Le bloc « Comptabilité du voyage » de l’onglet Règlement. */
export async function buildTripAccountingView(
  admin: SupabaseClient,
  booking: { id: string; client_settles_stay?: boolean | null },
  items: {
    id?: string | null;
    kind?: string | null;
    details?: Record<string, unknown> | null;
    commission_attendue?: unknown;
    commission_recue?: unknown;
    commission_taux?: unknown;
  }[],
  inputs: DossierAccountingInputs
): Promise<TripAccountingView> {
  const proposed = await loadOutgoingQueue({ bookingId: booking.id }, admin).catch(() => []);
  const pending = await loadDossierPendingCosts(
    admin,
    booking.id,
    inputs.costs.map((cost) => cost.sourceId)
  ).catch(() => []);
  const sales = saleLines(inputs.charges, booking.id);
  const commissions = items.flatMap((item) => {
    if (!item.id) return [];
    const commission = readCommission(item);
    if (commission.attendue == null && commission.recue == null) return [];
    return [{ itemId: item.id, attendue: commission.attendue, recue: commission.recue }];
  });
  const { lines, unsold, looseCommission } = accountLines(sales, [...inputs.costs, ...pending], commissions);
  const mbLines = mb3mDossierLines(inputs.charges, items, marginByTransaction(lines));
  const valid = inputs.pieces.filter((row) => row.printed_at && !row.credited_at);
  const stale = valid.filter((row) =>
    mb3mPieceStale({ transactionIds: row.transaction_ids || [], signature: row.line_signature }, mbLines)
  );
  const byTransaction: TripAccountingView["invoice"]["byTransaction"] = {};
  for (const row of inputs.pieces) {
    if (row.credited_at || !row.piece_number) continue;
    for (const id of row.transaction_ids || []) byTransaction[id] = { number: row.piece_number, printed: Boolean(row.printed_at) };
  }
  const latest = [...valid].sort((left, right) => (right.printed_at || "").localeCompare(left.printed_at || ""))[0] || null;
  const number = stale[0]?.piece_number || inputs.openNumber || latest?.piece_number || null;
  const printed = valid.length > 0;
  const marginStale = stale.length > 0;
  const anomalies: string[] = [];
  const stayItemIds = new Set(items.filter((item) => item.id && isStayAmountKind(item.kind)).map((item) => item.id as string));
  if (booking.client_settles_stay && unsold.some((cost) => cost.bookingItemId && stayItemIds.has(cost.bookingItemId))) {
    anomalies.push("Le client règle le séjour sur sa carte : un coût est rattaché à une carte sans vente au grand livre.");
  }
  return {
    lines,
    unsold,
    totals: tripTotals(lines, unsold, looseCommission),
    proposed,
    state: tripAccountingState({
      proposedCount: proposed.length,
      unsoldCount: unsold.length,
      invoiceNumber: number,
      invoicePrinted: printed && !inputs.openNumber,
      marginStale,
    }),
    invoice: {
      number,
      printed,
      marginStale,
      byTransaction,
      printedTotal: valid.length ? Math.round(valid.reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100 : null,
    },
    anomalies,
  };
}
