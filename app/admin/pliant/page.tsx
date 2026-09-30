import { PliantAccount, type PliantLine } from "@/components/admin/PliantAccount";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { pliantConfigured } from "@/lib/crm/pliant";
import { pliantStayForCard, type PliantStayRef } from "@/lib/crm/pliant-tx";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmPliantTransaction } from "@/lib/crm/types";

export default async function AdminPliantPage() {
  await requireStaffPage();
  const configured = pliantConfigured();
  let lines: PliantLine[] = [];
  if (configured) {
    try {
      const admin = createServiceClient();
      const { data } = await admin
        .from("crm_pliant_transactions")
        .select("*")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200);
      const rows = (data || []) as CrmPliantTransaction[];
      const cardIds = [...new Set(rows.map((row) => row.card_id).filter((id): id is string => Boolean(id)))];
      const stays: PliantStayRef[] = [];
      if (cardIds.length) {
        const { data: arrivals } = await admin
          .from("crm_hotel_arrivals")
          .select("pliant_card_id, card_last4, booking_id")
          .in("pliant_card_id", cardIds);
        const arrivalRows = (arrivals || []) as {
          pliant_card_id: string | null;
          card_last4: string | null;
          booking_id: string;
        }[];
        const bookingIds = [...new Set(arrivalRows.map((row) => row.booking_id).filter(Boolean))];
        const { data: bookings } = bookingIds.length
          ? await admin.from("crm_bookings").select("id, reference").in("id", bookingIds)
          : { data: [] as { id: string; reference: string | null }[] };
        const references = new Map(
          ((bookings || []) as { id: string; reference: string | null }[]).map((row) => [row.id, row.reference])
        );
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
          bookedAt: row.booked_at,
          last4: stay?.last4 || null,
          reference: stay?.reference || null,
          bookingId: stay?.bookingId || null,
        };
      });
    } catch {
      lines = [];
    }
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Pliant" subtitle="Transactions du compte : commerçant, montant et séjour quand la carte est la nôtre." />
      <div className="mt-6">
        <PliantAccount configured={configured} lines={lines} />
      </div>
    </div>
  );
}
