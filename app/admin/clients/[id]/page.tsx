import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";
import { ClientRevolutSuggestions } from "@/components/admin/ClientRevolutSuggestions";
import { DeleteCustomerButton } from "@/components/admin/DeleteCustomerButton";
import { InviteCustomerPanel } from "@/components/admin/InviteCustomerPanel";
import { getPortalAccess } from "@/lib/crm/invite";
import { suggestionsForCustomer } from "@/lib/crm/revolut-match";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmCompanion,
  type CrmCustomer,
  type CrmRevolutTransaction,
  type CrmTransaction,
  type CrmTravelDocument,
  DOC_TYPE_LABELS,
  filterCreditTransfers,
} from "@/lib/crm/types";
import { documentExpiryStatus } from "@/lib/crm/identity";
import { StatusChip } from "@/components/crm/ui";
import { clientLedgerAdminHref } from "@/lib/crm/client-ledger";
import { formatDateFr, formatMoney, formatCreditDisponible } from "@/lib/crm/money";

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

  const [
    { data: companions },
    { data: documents },
    { data: bookings },
    { data: txs },
    { data: balances },
    { data: companyAdmins },
    portal,
    unmatchedRevolut,
  ] = await Promise.all([
    supabase.from("crm_travel_companions").select("*").eq("customer_id", id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", id),
    supabase.from("crm_bookings").select("*").eq("customer_id", id).order("start_date", { ascending: false }),
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("customer_id", id)
      .eq("kind", "transfer")
      .eq("direction", "credit")
      .order("occurred_on", { ascending: false }),
    supabase.from("crm_customer_balances").select("*").eq("customer_id", id),
    supabase
      .from("crm_customers")
      .select("*")
      .eq("company_role", "admin")
      .order("last_name"),
    getPortalAccess(c),
    (async () => {
      try {
        const admin = createServiceClient();
        const { data } = await admin
          .from("crm_revolut_transactions")
          .select("*")
          .eq("status", "unmatched")
          .eq("direction", "credit")
          .order("booked_at", { ascending: false, nullsFirst: false })
          .limit(100);
        return (data || []) as CrmRevolutTransaction[];
      } catch {
        return [] as CrmRevolutTransaction[];
      }
    })(),
  ]);
  const bookingRows = (bookings || []) as CrmBooking[];
  const revolutSuggestions = suggestionsForCustomer(c, unmatchedRevolut);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">
          {customerFullName(c)}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={clientLedgerAdminHref(c.id)}
            className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm"
          >
            Transactions du client
          </Link>
          <DeleteCustomerButton customerId={c.id} name={customerFullName(c)} />
        </div>
      </div>
      <InviteCustomerPanel customerId={c.id} initial={portal} />
      <div className="flex flex-wrap gap-3">
        {((balances || []) as CrmBalance[]).map((b) => {
          const value = Number(b.balance);
          return (
            <div key={b.currency} className="admin-af-card rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                {value > 0 ? `Crédit disponible ${b.currency}` : `Encours ${b.currency}`}
              </p>
              <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
                {value > 0 ? formatCreditDisponible(value, b.currency) : formatMoney(value, b.currency)}
              </p>
              {value > 0 ? (
                <p className="mt-1 text-xs text-[#9e7e51]">Frais d’agence 10 % déduits</p>
              ) : null}
            </div>
          );
        })}
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
      <section className="admin-af-card overflow-hidden rounded-3xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Validation des pièces</h2>
        </div>
        <ul className="divide-y divide-border text-sm">
          {((documents || []) as CrmTravelDocument[]).map((doc) => {
            const expiry = documentExpiryStatus(doc.expires_on);
            return (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="block font-medium text-[var(--admin-navy)]">
                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                    {doc.number ? ` · ${doc.number}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {[doc.first_name, doc.last_name].filter(Boolean).join(" ") || "Titulaire"}
                    {doc.expires_on ? ` · expire le ${formatDateFr(doc.expires_on)}` : ""}
                  </span>
                </span>
                <StatusChip tone={expiry.tone}>{expiry.label}</StatusChip>
              </li>
            );
          })}
          {!documents?.length ? (
            <li className="px-5 py-8 text-center text-muted">Aucune pièce au coffre.</li>
          ) : null}
        </ul>
      </section>
      <CustomerEditor
        customer={c}
        companions={(companions || []) as CrmCompanion[]}
        documents={(documents || []) as CrmTravelDocument[]}
        companyAdmins={(companyAdmins || []) as CrmCustomer[]}
      />
      <ClientRevolutSuggestions suggestions={revolutSuggestions} />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Virements crédit</h2>
          <Link
            href={clientLedgerAdminHref(c.id)}
            className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
          >
            Voir comme le client
          </Link>
        </div>
        {!(txs || []).length ? (
          <p className="mt-2 text-sm text-muted">
            Aucun virement crédit. Ils apparaissent après rapprochement Revolut ou saisie manuelle.
          </p>
        ) : null}
        <ul className="mt-2 divide-y divide-border text-sm">
          {filterCreditTransfers((txs || []) as CrmTransaction[]).map((t) => (
            <li key={t.id} className="flex justify-between py-2">
              <span>
                {t.label} · {formatDateFr(t.occurred_on)}
              </span>
              <span>+{formatMoney(Number(t.amount), t.currency)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
