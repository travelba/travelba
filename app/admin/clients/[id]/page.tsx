import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";
import { DeleteCustomerButton } from "@/components/admin/DeleteCustomerButton";
import { InviteCustomerPanel } from "@/components/admin/InviteCustomerPanel";
import { getPortalAccess } from "@/lib/crm/invite";
import {
  customerFullName,
  type CrmBalance,
  type CrmBooking,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">
          {customerFullName(c)}
        </h1>
        <DeleteCustomerButton customerId={c.id} name={customerFullName(c)} />
      </div>
      <InviteCustomerPanel customerId={c.id} initial={portal} />
      <div className="flex flex-wrap gap-3">
        {((balances || []) as CrmBalance[]).map((b) => (
          <div key={b.currency} className="admin-af-card rounded-2xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              Encours {b.currency}
            </p>
            <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
              {formatMoney(Number(b.balance), b.currency)}
            </p>
          </div>
        ))}
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dossiers</p>
          <p className="font-display text-xl font-bold text-[var(--admin-navy)]">{bookingRows.length}</p>
        </div>
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Voyageurs</p>
          <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
            {1 + ((companions || []) as CrmCompanion[]).length}
          </p>
        </div>
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Pièces</p>
          <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
            {((documents || []) as CrmTravelDocument[]).length}
          </p>
        </div>
      </div>
      <CustomerEditor
        customer={c}
        companions={(companions || []) as CrmCompanion[]}
        documents={(documents || []) as CrmTravelDocument[]}
      />
      <section className="admin-af-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Réservations</h2>
          <Link
            href="/admin/reservations"
            className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
          >
            Nouveau dossier
          </Link>
        </div>
        {bookingRows.length ? (
          <ul className="mt-2 divide-y divide-border text-sm">
            {bookingRows.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <Link
                  href={`/admin/reservations/${b.id}`}
                  className="text-[var(--admin-navy)] underline-offset-2 hover:underline"
                >
                  {b.reference} · {b.title} · {formatDateFr(b.start_date)}
                </Link>
                <DeleteBookingButton
                  compact
                  redirectTo={null}
                  bookingId={b.id}
                  label={`${b.reference} — ${b.title}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Aucun dossier pour ce client. Importez ses confirmations depuis Réservations.
          </p>
        )}
      </section>
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">Transactions</h2>
        {!(txs || []).length ? (
          <p className="mt-2 text-sm text-muted">
            Aucune écriture. Les débits sont créés à la confirmation d’un dossier, les crédits au rapprochement Revolut ou à la saisie manuelle.
          </p>
        ) : null}
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
