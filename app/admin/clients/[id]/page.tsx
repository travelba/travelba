import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerEditor } from "@/components/admin/CustomerEditor";
import {
  ArchiveBookingButton,
  DuplicateBookingButton,
  RestoreBookingButton,
} from "@/components/admin/ArchiveBookingButton";
import { ClientRevolutSuggestions } from "@/components/admin/ClientRevolutSuggestions";
import { DeleteCustomerButton } from "@/components/admin/DeleteCustomerButton";
import { InviteCustomerPanel } from "@/components/admin/InviteCustomerPanel";
import { CustomerLoginLog } from "@/components/admin/CustomerLoginLog";
import { formatCustomerLoginAt } from "@/lib/crm/customer-login";
import { getPortalAccess } from "@/lib/crm/invite";
import {
  REVOLUT_MATCH_SELECT,
  suggestionsForCustomer,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmCompanion,
  type CrmCustomer,
  type CrmRevolutTransaction,
  type CrmTransaction,
  type CrmBillingCompany,
  type CrmCustomerLogin,
  type CrmTravelDocument,
  DOC_TYPE_LABELS,
  filterCreditTransfers,
} from "@/lib/crm/types";
import { documentExpiryStatus } from "@/lib/crm/identity";
import { reviewIdentityPieces } from "@/lib/crm/trip-documents";
import { stayHeadline } from "@/lib/crm/carnet";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { StatusChip } from "@/components/crm/ui";
import { BookingHero } from "@/components/crm/BookingHero";
import { FilePreviewTile } from "@/components/crm/FilePreview";
import { identityPreview } from "@/lib/crm/preview-files";
import { clientLedgerAdminHref } from "@/lib/crm/client-ledger";
import { ficheBookingTravelerLine, ficheTravelerCaption, mergeFicheBookings } from "@/lib/crm/fiche-bookings";
import { formatDateFr, formatMoney, formatCreditDisponible } from "@/lib/crm/money";
import { CUSTOMER_PICK_SELECT, type PickableCustomer } from "@/lib/crm/customer-search";
import { WhatsappThread } from "@/components/admin/WhatsappThread";

type Props = { params: Promise<{ id: string }> };

export default async function AdminClientDetailPage({ params }: Props) {
  const { id } = await params;
  const { supabase, staff } = await requireStaffPage();
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
    { data: billedBookings },
    { data: txs },
    { data: balances },
    { data: companyAdmins },
    { data: billingCompanies },
    portal,
    revolut,
    whatsappMessages,
    whatsappRequests,
    { data: loginRows, error: loginError },
  ] = await Promise.all([
    supabase.from("crm_travel_companions").select("*").eq("customer_id", id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", id),
    supabase.from("crm_bookings").select("*").eq("customer_id", id).order("start_date", { ascending: false }),
    supabase
      .from("crm_bookings")
      .select("*")
      .eq("billing_customer_id", id)
      .order("start_date", { ascending: false }),
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
      .select(CUSTOMER_PICK_SELECT)
      .eq("company_role", "admin")
      .order("last_name"),
    supabase.from("crm_billing_companies").select("*").eq("customer_id", id).order("sort_order"),
    getPortalAccess(c),
    (async () => {
      try {
        const admin = createServiceClient();
        const [{ data }, { data: people }] = await Promise.all([
          admin
            .from("crm_revolut_transactions")
            .select("*")
            .eq("status", "unmatched")
            .eq("direction", "credit")
            .order("booked_at", { ascending: false, nullsFirst: false })
            .limit(100),
          admin.from("crm_customers").select(REVOLUT_MATCH_SELECT),
        ]);
        return {
          rows: (data || []) as CrmRevolutTransaction[],
          people: (people || []) as RevolutMatchCustomer[],
        };
      } catch {
        return { rows: [] as CrmRevolutTransaction[], people: [] as RevolutMatchCustomer[] };
      }
    })(),
    supabase
      .from("crm_whatsapp_messages")
      .select("id, direction, body, status, created_at, booking_id")
      .eq("customer_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_whatsapp_requests")
      .select("id, kind, body, booking_id, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_customer_logins")
      .select("id, customer_id, auth_user_id, method, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);
  const logins = loginError ? [] : ((loginRows || []) as CrmCustomerLogin[]);
  const bookingRows = mergeFicheBookings(
    (bookings || []) as CrmBooking[],
    (billedBookings || []) as CrmBooking[]
  );
  const activeBookings = bookingRows.filter((row) => !row.archived_at);
  const archivedBookings = bookingRows.filter((row) => row.archived_at);
  const travelerIds = [
    ...new Set(bookingRows.map((row) => row.customer_id).filter((customerId) => customerId !== id)),
  ];
  const travelerNames = new Map<string, string>();
  if (travelerIds.length) {
    const { data: travelers } = await supabase
      .from("crm_customers")
      .select("id, first_name, last_name")
      .in("id", travelerIds);
    for (const traveler of (travelers || []) as Pick<CrmCustomer, "id" | "first_name" | "last_name">[]) {
      travelerNames.set(traveler.id, ficheTravelerCaption(traveler));
    }
  }
  const identityPieces = reviewIdentityPieces((documents || []) as CrmTravelDocument[]);
  const places = await loadStayMaps(
    supabase,
    bookingRows.map((row) => row.id)
  );
  const threadMessages = whatsappMessages.error
    ? (
        await supabase
          .from("crm_whatsapp_messages")
          .select("id, direction, body, status, created_at")
          .eq("customer_id", id)
          .order("created_at", { ascending: true })
      ).data || []
    : whatsappMessages.data || [];
  const revolutSuggestions = suggestionsForCustomer(c, revolut.rows, revolut.people);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="min-w-0 break-words font-display text-3xl font-extrabold text-[var(--admin-navy)]">
          {customerFullName(c)}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={clientLedgerAdminHref(c.id)}
            className="admin-af-btn inline-flex rounded-xl px-4 py-2.5 text-sm"
          >
            Transactions du client
          </Link>
          {staff.role === "admin" ? <DeleteCustomerButton customerId={c.id} name={customerFullName(c)} /> : null}
        </div>
      </div>
      <InviteCustomerPanel customerId={c.id} initial={portal} />
      <CustomerLoginLog logins={logins} />
      <WhatsappThread
        messages={threadMessages}
        requests={whatsappRequests.error ? [] : whatsappRequests.data || []}
        bookings={activeBookings.map((booking) => ({ id: booking.id, reference: booking.reference }))}
      />
      <div className="flex flex-wrap gap-3">
        {((balances || []) as CrmBalance[]).map((b) => {
          const value = Number(b.balance);
          return (
            <Link
              key={b.currency}
              href={clientLedgerAdminHref(c.id)}
              className="admin-af-card block rounded-2xl px-4 py-3 transition hover:border-[var(--admin-gold)]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
                {value > 0 ? `Crédit disponible ${b.currency}` : `Encours ${b.currency}`}
              </p>
              <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
                {value > 0 ? formatCreditDisponible(value, b.currency) : formatMoney(value, b.currency)}
              </p>
              <p className="mt-2 text-xs font-semibold text-[var(--admin-navy)]">Voir les transactions</p>
            </Link>
          );
        })}
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dossiers</p>
          <p className="font-display text-xl font-bold text-[var(--admin-navy)]">{activeBookings.length}</p>
        </div>
        <div className="admin-af-card rounded-2xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dernière connexion</p>
          <p className="mt-1 font-display text-base font-bold text-[var(--admin-navy)] first-letter:uppercase">
            {formatCustomerLoginAt(logins[0]?.created_at || portal.lastSignInAt) || "Jamais"}
          </p>
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
            {identityPieces.length}
          </p>
        </div>
      </div>
      <section className="admin-af-card overflow-hidden rounded-3xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Validation des pièces</h2>
        </div>
        <ul className="divide-y divide-border text-sm">
          {identityPieces.map((doc) => {
            const expiry = documentExpiryStatus(doc.expires_on);
            return (
              <li key={doc.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-5 py-3">
                {doc.storage_path ? (
                  <FilePreviewTile
                    file={
                      identityPreview(
                        doc,
                        [doc.first_name, doc.last_name].filter(Boolean).join(" ") ||
                          DOC_TYPE_LABELS[doc.doc_type] ||
                          "Pièce"
                      )!
                    }
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium text-[var(--admin-navy)]">
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
          {!identityPieces.length ? (
            <li className="px-5 py-8 text-center text-muted">Aucune pièce au coffre.</li>
          ) : null}
        </ul>
      </section>
      <CustomerEditor
        key={c.updated_at}
        customer={c}
        companions={(companions || []) as CrmCompanion[]}
        documents={(documents || []) as CrmTravelDocument[]}
        companyAdmins={(companyAdmins || []) as PickableCustomer[]}
        billingCompanies={(billingCompanies || []) as CrmBillingCompany[]}
      />
      <ClientRevolutSuggestions suggestions={revolutSuggestions} />
      <section className="admin-af-card rounded-3xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Réservations</h2>
          <Link
            href="/admin/reservations/nouveau"
            className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
          >
            Nouveau dossier
          </Link>
        </div>
        {activeBookings.some((row) => row.customer_id !== id) ? (
          <p className="mt-1 text-xs text-muted">
            Les séjours facturés sur ce compte figurent ici, avec le nom du voyageur.
          </p>
        ) : null}
        {activeBookings.length ? (
          <ul className="mt-2 divide-y divide-border text-sm">
            {activeBookings.map((b) => {
              const travelerLine = ficheBookingTravelerLine(b, id, travelerNames);
              return (
                <li key={b.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2">
                  <Link
                    href={`/admin/reservations/${b.id}`}
                    className="flex min-w-0 items-center gap-3 text-[var(--admin-navy)] underline-offset-2 hover:underline"
                  >
                    <BookingHero booking={b} places={places.arrival[b.id]} plain className="h-12 w-20 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {b.reference} · {stayHeadline(b.title, b.destination, places.route[b.id])} · {formatDateFr(b.start_date)}
                      </span>
                      {travelerLine ? (
                        <span className="block truncate text-xs text-muted">{travelerLine}</span>
                      ) : null}
                    </span>
                  </Link>
                  <div className="flex flex-col items-end gap-1">
                    <DuplicateBookingButton compact bookingId={b.id} />
                    <ArchiveBookingButton
                      compact
                      redirectTo={null}
                      bookingId={b.id}
                      label={`${b.reference} — ${b.title}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Aucun dossier pour ce client. Importez ses confirmations depuis Nouveau dossier.
          </p>
        )}
        {archivedBookings.length ? (
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Archivées</h3>
            <ul className="mt-2 divide-y divide-border text-sm">
              {archivedBookings.map((b) => (
                <li key={b.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2">
                  <Link
                    href={`/admin/reservations/${b.id}`}
                    className="min-w-0 text-[var(--admin-navy)] underline-offset-2 hover:underline"
                  >
                    {b.reference} · {stayHeadline(b.title, b.destination, places.route[b.id])}
                  </Link>
                  <RestoreBookingButton compact bookingId={b.id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
            <li key={t.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0 break-words">
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
