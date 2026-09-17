import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { InviteCustomerPanel } from "@/components/admin/InviteCustomerPanel";
import { CustomerTripDocuments } from "@/components/crm/CustomerTripDocuments";
import { getPortalAccess } from "@/lib/crm/invite";
import {
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTransaction,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

type Props = { params: Promise<{ id: string }> };

export default async function AdminClientDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage();
  const { data: customer } = await supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();
  const c = customer as CrmCustomer;

  const [{ data: companions }, { data: documents }, { data: bookings }, { data: txs }, { data: balances }, portal] =
    await Promise.all([
      supabase.from("crm_travel_companions").select("*").eq("customer_id", id),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", id),
      supabase.from("crm_bookings").select("*").eq("customer_id", id).order("start_date", { ascending: false }),
      supabase
        .from("crm_transactions")
        .select("*")
        .eq("customer_id", id)
        .order("occurred_on", { ascending: false }),
      supabase.from("crm_customer_balances").select("*").eq("customer_id", id),
      getPortalAccess(c),
    ]);
  const bookingRows = (bookings || []) as CrmBooking[];
  const { data: travelerRows } = bookingRows.length
    ? await supabase
        .from("crm_booking_travelers")
        .select("*")
        .in(
          "booking_id",
          bookingRows.map((b) => b.id)
        )
    : { data: [] as CrmBookingTraveler[] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">
          {customerFullName(c)}
        </h1>
      </div>
      <InviteCustomerPanel customerId={c.id} initial={portal} />
      <div className="flex flex-wrap gap-3">
        {((balances || []) as CrmBalance[]).map((b) => (
          <div key={b.currency} className="admin-af-card rounded-2xl px-4 py-3">
            <p className="text-xs text-muted">Encours {b.currency}</p>
            <p className="font-display text-xl font-bold">
              {formatMoney(Number(b.balance), b.currency)}
            </p>
          </div>
        ))}
      </div>
      <CustomerEditor
        customer={c}
        companions={(companions || []) as CrmCompanion[]}
      />
      <CustomerTripDocuments
        bookings={bookingRows}
        travelers={(travelerRows || []) as CrmBookingTraveler[]}
        documents={(documents || []) as CrmTravelDocument[]}
      />
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Réservations</h2>
        <ul className="mt-2 text-sm">
          {bookingRows.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/reservations/${b.id}`}>
                {b.reference} · {b.title} · {formatDateFr(b.start_date)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Transactions</h2>
        <ul className="mt-2 divide-y divide-border text-sm">
          {((txs || []) as CrmTransaction[]).map((t) => (
            <li key={t.id} className="flex justify-between py-2">
              <span>
                {t.label} · {formatDateFr(t.occurred_on)}
              </span>
              <span>
                {t.direction === "credit" ? "+" : "−"}
                {formatMoney(Number(t.amount), t.currency)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
