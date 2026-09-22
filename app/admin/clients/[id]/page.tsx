import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
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
} from "@/lib/crm/types";
import { formatDateFr, formatMoney, formatCreditDisponible, postedLedgerTotals } from "@/lib/crm/money";
import {
  companyDisplayName,
  companyPaidBookingIds,
  companyRoleLabel,
  isCompanyAdmin,
  isCompanyMember,
  isCompanyPaidBooking,
  mergeRowsById,
} from "@/lib/crm/company-role";
import { PayerChip } from "@/components/crm/PayerChip";

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
    { data: travelerBookings },
    { data: billedBookings },
    { data: members },
    { data: txs },
    { data: balances },
    { data: companyAdmins },
    portal,
    unmatchedRevolut,
  ] = await Promise.all([
    supabase.from("crm_travel_companions").select("*").eq("customer_id", id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", id),
    supabase.from("crm_bookings").select("*").eq("customer_id", id).order("start_date", { ascending: false }),
    supabase.from("crm_bookings").select("*").eq("billing_customer_id", id).order("start_date", { ascending: false }),
    supabase.from("crm_customers").select("*").eq("billing_parent_id", id).order("last_name"),
    supabase
      .from("crm_transactions")
      .select("*")
      .eq("customer_id", id)
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
  const bookingRows = mergeRowsById(
    (travelerBookings || []) as CrmBooking[],
    (billedBookings || []) as CrmBooking[]
  ).sort((a, b) => (a.start_date || "") < (b.start_date || "") ? 1 : -1);
  const revolutSuggestions = suggestionsForCustomer(c, unmatchedRevolut);
  const memberRows = (members || []) as CrmCustomer[];
  const paidIds = isCompanyMember(c) ? companyPaidBookingIds(bookingRows, c.id) : [];
  const parentAdmin = isCompanyMember(c)
    ? ((companyAdmins || []) as CrmCustomer[]).find((a) => a.id === c.billing_parent_id) || null
    : null;
  const companyName = parentAdmin ? companyDisplayName(parentAdmin) : c.company_name;
  const travelerNames = new Map(
    ((companyAdmins || []) as CrmCustomer[])
      .concat(memberRows)
      .concat([c])
      .map((row) => [row.id, { name: customerFullName(row), company: companyDisplayName(row) }])
  );
  const missingIds = [
    ...new Set(bookingRows.flatMap((b) => [b.customer_id, b.billing_customer_id])),
  ].filter((rowId) => !travelerNames.has(rowId));
  if (missingIds.length) {
    const { data: extra } = await supabase
      .from("crm_customers")
      .select("id, first_name, last_name, company_name")
      .in("id", missingIds);
    for (const row of (extra || []) as CrmCustomer[]) {
      travelerNames.set(row.id, { name: customerFullName(row), company: companyDisplayName(row) });
    }
  }

  let companyTripTxs: CrmTransaction[] = [];
  if (paidIds.length) {
    const { data } = await supabase
      .from("crm_transactions")
      .select("*")
      .eq("status", "posted")
      .eq("direction", "debit")
      .in("booking_id", paidIds)
      .order("occurred_on", { ascending: false });
    companyTripTxs = (data || []) as CrmTransaction[];
  }
  const companyTripDebits = postedLedgerTotals(companyTripTxs).debits;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">
            {customerFullName(c)}
          </h1>
          {c.company_role ? (
            <p className="mt-1 text-sm text-[#9e7e51]">
              {companyRoleLabel(c.company_role)}
              {isCompanyMember(c) && companyName ? ` · rattaché à ${companyName}` : ""}
              {isCompanyAdmin(c) && c.company_name ? ` · ${c.company_name}` : ""}
            </p>
          ) : null}
        </div>
        <DeleteCustomerButton customerId={c.id} name={customerFullName(c)} />
      </div>
      <InviteCustomerPanel customerId={c.id} initial={portal} />
      <div className="flex flex-wrap gap-3">
        {((balances || []) as CrmBalance[]).map((b) => {
          const value = Number(b.balance);
          return (
            <div key={b.currency} className="admin-af-card rounded-2xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                {isCompanyMember(c)
                  ? value > 0
                    ? `Crédit perso ${b.currency}`
                    : `Encours perso ${b.currency}`
                  : value > 0
                    ? `Crédit disponible ${b.currency}`
                    : `Encours ${b.currency}`}
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
        {isCompanyMember(c) ? (
          <div className="admin-af-card rounded-2xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              Frais {companyName || "société"}
            </p>
            <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
              {formatMoney(companyTripDebits, companyTripTxs[0]?.currency || "EUR")}
            </p>
            <p className="mt-1 text-xs text-[#9e7e51]">Ses dossiers — pas le solde société</p>
          </div>
        ) : null}
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
        companyAdmins={(companyAdmins || []) as CrmCustomer[]}
      />
      {isCompanyAdmin(c) && memberRows.length ? (
        <section className="admin-af-card rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">Collaborateurs rattachés</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {memberRows.map((m) => (
              <li key={m.id} className="py-2">
                <Link
                  href={`/admin/clients/${m.id}`}
                  className="text-[var(--admin-navy)] underline-offset-2 hover:underline"
                >
                  {customerFullName(m)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
            {bookingRows.map((b) => {
              const companyPaid = isCompanyPaidBooking(b, b.customer_id);
              const traveler = travelerNames.get(b.customer_id)?.name || "Client";
              const payer = travelerNames.get(b.billing_customer_id)?.company || companyName;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link
                    href={`/admin/reservations/${b.id}`}
                    className="text-[var(--admin-navy)] underline-offset-2 hover:underline"
                  >
                    {b.reference} · {b.title} · {traveler} · {formatDateFr(b.start_date)}
                  </Link>
                  {companyPaid || isCompanyMember(c) ? (
                    <PayerChip
                      kind={companyPaid ? "company" : "personal"}
                      companyName={payer}
                      voice="admin"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Aucun dossier pour ce client. Importez ses confirmations depuis Réservations.
          </p>
        )}
      </section>
      {isCompanyMember(c) ? (
        <section className="admin-af-card rounded-3xl p-5">
          <h2 className="font-display text-lg font-bold">
            Frais {companyName || "société"} (ses dossiers)
          </h2>
          <p className="mt-1 text-sm text-muted">
            Débits postés sur le wallet société. Le solde {companyName || "société"} reste sur la
            fiche admin société.
          </p>
          {companyTripTxs.length ? (
            <ul className="mt-2 divide-y divide-border text-sm">
              {companyTripTxs.map((t) => (
                <li key={t.id} className="flex justify-between py-2">
                  <span>
                    {t.label} · {formatDateFr(t.occurred_on)}
                  </span>
                  <span>−{formatMoney(Number(t.amount), t.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucun frais société sur ses dossiers.</p>
          )}
        </section>
      ) : null}
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold">
          {isCompanyMember(c) ? "Transactions personnelles" : "Transactions"}
        </h2>
        {!(txs || []).length ? (
          <p className="mt-2 text-sm text-muted">
            {isCompanyMember(c)
              ? "Aucune écriture sur son wallet. Un séjour à sa charge créera l’encours perso ici."
              : "Aucune écriture. Les débits sont créés à la confirmation d’un dossier, les crédits au rapprochement Revolut ou à la saisie manuelle."}
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
