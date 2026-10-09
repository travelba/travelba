import { PliantAccount, type PliantLine } from "@/components/admin/PliantAccount";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import { billingCustomersByCard } from "@/lib/crm/pliant-match";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";
import { pliantStayForCard, type PliantStayRef } from "@/lib/crm/pliant-tx";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmPliantTransaction } from "@/lib/crm/types";
import Link from "next/link";
import { CUSTOMER_PICK_SELECT } from "@/lib/crm/customer-search";
import { parseLoadMore, type SearchParamValue } from "@/lib/crm/admin-list";

/** Dépenses lues par page : 500, puis « Charger plus » (A-22). */
const PLIANT_PAGE = 500;
const PLIANT_MAX = 4000;

export const metadata = { title: "Pliant" };

export default async function AdminPliantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  await requireStaffPage();
  const limit = parseLoadMore((await searchParams).limite, PLIANT_PAGE, PLIANT_MAX);
  const configured = pliantConfigured();
  const account = configured ? await loadPliantAccountBalance() : null;
  let lines: PliantLine[] = [];
  let customers: PickableCustomer[] = [];
  let more = false;
  if (configured) {
    try {
      const admin = createServiceClient();
      // Sélecteur de payeur de `PliantAccount` (composant d’un autre lot) : colonnes du sélecteur, sans
      // plafond — un plafond ferait disparaître des clients du <select>.
      const { data: people } = await admin
        .from("crm_customers")
        .select(CUSTOMER_PICK_SELECT)
        .order("last_name");
      customers = (people || []) as PickableCustomer[];
      const rows: CrmPliantTransaction[] = [];
      for (let from = 0; from < limit; from += PLIANT_PAGE) {
        const { data, error } = await admin
          .from("crm_pliant_transactions")
          .select(
            "id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, holder_name, category, comment, match_status, matched_customer_id"
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
      const stays: PliantStayRef[] = [];
      let payersByCard = new Map<string, string[]>();
      const arrivalRows: {
        pliant_card_id: string | null;
        card_last4: string | null;
        booking_id: string;
      }[] = [];
      for (let index = 0; index < cardIds.length; index += 100) {
        const { data: arrivals } = await admin
          .from("crm_hotel_arrivals")
          .select("pliant_card_id, card_last4, booking_id")
          .in("pliant_card_id", cardIds.slice(index, index + 100));
        arrivalRows.push(
          ...((arrivals || []) as {
            pliant_card_id: string | null;
            card_last4: string | null;
            booking_id: string;
          }[])
        );
      }
      if (arrivalRows.length) {
        const bookingIds = [...new Set(arrivalRows.map((row) => row.booking_id).filter(Boolean))];
        const { data: bookings } = bookingIds.length
          ? await admin.from("crm_bookings").select("id, reference, billing_customer_id").in("id", bookingIds)
          : { data: [] as { id: string; reference: string | null; billing_customer_id: string | null }[] };
        const bookingRows = (bookings || []) as {
          id: string;
          reference: string | null;
          billing_customer_id: string | null;
        }[];
        const references = new Map(bookingRows.map((row) => [row.id, row.reference]));
        payersByCard = billingCustomersByCard(arrivalRows, bookingRows);
        for (const arrival of arrivalRows) {
          if (!arrival.pliant_card_id) continue;
          stays.push({
            cardId: arrival.pliant_card_id,
            bookingId: arrival.booking_id,
            reference: references.get(arrival.booking_id) || null,
            last4: arrival.card_last4,
          });
        }
      }
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
          bookingId: stay?.bookingId || null,
          matchStatus: row.match_status || "unmatched",
          matchedCustomerId: row.matched_customer_id,
          linkedCustomerIds: row.card_id ? payersByCard.get(row.card_id) || [] : [],
        };
      });
    } catch (err) {
      console.error("[admin/pliant]", err instanceof Error ? err.message : err);
      lines = [];
      more = false;
    }
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Pliant"
        subtitle="Chaque dépense indique la carte. Proposition vers le compte client : Valider ou Refuser."
      />
      <div className="mt-6">
        <PliantAccount configured={configured} lines={lines} customers={customers} account={account} />
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
