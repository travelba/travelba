import { PliantAccount, type PliantLine } from "@/components/admin/PliantAccount";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requirePermissionPage } from "@/lib/crm/agency-guard";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";
import { loadPliantStayRefs } from "@/lib/crm/pliant-dossier-run";
import { pliantStayForCard } from "@/lib/crm/pliant-tx";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmPliantTransaction } from "@/lib/crm/types";
import Link from "next/link";
import { parseLoadMore, type SearchParamValue } from "@/lib/crm/admin-list";
import { formatDateTimeFr } from "@/lib/crm/money";
import { tripCostEventSentence } from "@/lib/crm/pliant-link";
import { itemLabelFor, loadLatestTripCostEvents, loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import type { OutgoingLine } from "@/lib/crm/trip-costs";

/** Dépenses lues par page : 500, puis « Charger plus » (A-22). */
const PLIANT_PAGE = 500;
const PLIANT_MAX = 4000;

export const metadata = { title: "Pliant" };

export default async function AdminPliantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  await requirePermissionPage("view_finances");
  const limit = parseLoadMore((await searchParams).limite, PLIANT_PAGE, PLIANT_MAX);
  const configured = pliantConfigured();
  const account = configured ? await loadPliantAccountBalance() : null;
  let lines: PliantLine[] = [];
  let more = false;
  try {
      const admin = createServiceClient();
      const rows: CrmPliantTransaction[] = [];
      for (let from = 0; from < limit; from += PLIANT_PAGE) {
        const { data, error } = await admin
          .from("crm_pliant_transactions")
          .select(
            "id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, holder_name, category, comment, match_status"
          )
          .or("type.is.null,type.neq.STATUS_INQUIRY")
          .order("booked_at", { ascending: false, nullsFirst: false })
          .range(from, from + PLIANT_PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as CrmPliantTransaction[];
        rows.push(...batch);
        if (batch.length < PLIANT_PAGE) break;
        if (from + PLIANT_PAGE >= limit) more = limit < PLIANT_MAX;
      }
      const cardIds = [...new Set(rows.map((row) => row.card_id).filter((id): id is string => Boolean(id)))];
      const stays = await loadPliantStayRefs(admin, cardIds);

      const [queue, costs] = await Promise.all([
        loadOutgoingQueue({ source: "pliant", limit: PLIANT_MAX }, admin),
        admin
          .from("crm_trip_costs")
          .select("id, source_id, booking_id, booking_item_id")
          .eq("source", "pliant")
          .in("source_id", rows.map((row) => row.id).slice(0, 1000)),
      ]);
      const outgoing = new Map<string, OutgoingLine>(queue.map((line) => [line.id, line]));
      const costRows = (costs.data || []) as { id: string; source_id: string; booking_id: string; booking_item_id: string | null }[];
      const costBookingIds = [...new Set(costRows.map((row) => row.booking_id))];
      const costItemIds = costRows.map((row) => row.booking_item_id).filter((id): id is string => Boolean(id));
      const [{ data: costBookings }, { data: costItems }] = await Promise.all([
        costBookingIds.length
          ? admin.from("crm_bookings").select("id, reference, title, destination").in("id", costBookingIds)
          : Promise.resolve({ data: [] }),
        costItemIds.length
          ? admin.from("crm_booking_items").select("id, kind, title, details").in("id", costItemIds)
          : Promise.resolve({ data: [] }),
      ]);
      const costReference = new Map(
        ((costBookings || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
          row.id,
          [row.reference, (row.title || row.destination || "").trim()].filter(Boolean).join(" · "),
        ])
      );
      const costItemLabel = new Map(
        ((costItems || []) as { id: string; kind: string | null; title: string | null; details: Record<string, unknown> | null }[]).map((item) => [item.id, itemLabelFor(item)])
      );
      const costById = new Map(
        costRows.map((row) => [
          row.source_id,
          {
            id: row.id,
            bookingId: row.booking_id,
            reference: costReference.get(row.booking_id) || "Voyage",
            itemLabel: row.booking_item_id ? costItemLabel.get(row.booking_item_id) || null : "Montant du séjour",
          },
        ])
      );
      const audits = await loadLatestTripCostEvents(rows.map((row) => row.id), admin);

      lines = rows.map((row) => {
        const stay = pliantStayForCard(row.card_id, stays);
        return {
          id: row.id,
          merchant: row.merchant,
          status: row.status,
          type: row.type,
          billingCents: row.billing_cents,
          currency: row.billing_currency,
          transactionCents: row.transaction_cents,
          transactionCurrency: row.transaction_currency,
          bookedAt: row.booked_at,
          cardLabel: row.card_label,
          last4: row.card_last4 || stay?.last4 || null,
          holderName: row.holder_name,
          category: row.category,
          comment: row.comment,
          reference: stay?.reference || null,
          title: stay?.title || null,
          client: stay?.client || null,
          company: stay?.company || null,
          bookingId: stay?.bookingId || null,
          matchStatus: row.match_status || "unmatched",
          outgoing: outgoing.get(row.id) || null,
          cost: costById.get(row.id) || null,
          auditLabel: (() => {
            const event = audits.get(row.id);
            if (!event) return null;
            return tripCostEventSentence({
              action: event.action,
              who: event.who,
              fromReference: event.fromReference,
              toReference: event.toReference,
              atLabel: formatDateTimeFr(event.at),
            });
          })(),
        };
      });
    } catch (err) {
      console.error("[admin/pliant]", err instanceof Error ? err.message : err);
      lines = [];
      more = false;
    }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Pliant"
        subtitle="Chaque dépense indique la carte. Elle se rattache à une ligne d’un voyage, ou reste hors voyage."
      />
      <div className="mt-6">
        <PliantAccount configured={configured} lines={lines} account={account} />
        {more ? (
          <p className="mt-4 text-center">
            <Link
              href={`/admin/pliant?limite=${limit + PLIANT_PAGE}`}
              className="admin-tap inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Charger plus ({lines.length} dépenses affichées)
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
