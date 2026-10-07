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
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { ClientStripeSuggestions } from "@/components/admin/ClientStripeSuggestions";
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
import {
  STRIPE_MATCH_SELECT,
  suggestionsForStripeCustomer,
  type StripeMatchCustomer,
} from "@/lib/crm/stripe-match";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmCompanion,
  type CrmCustomer,
  type CrmRevolutTransaction,
  type CrmStripeTransaction,
  type CrmTransaction,
  type CrmBillingCompany,
  type CrmCustomerActivity,
  type CrmCustomerLogin,
  type CrmTravelDocument,
  DOC_TYPE_LABELS,
  filterAgencyReceipts,
} from "@/lib/crm/types";
import { documentExpiryStatus } from "@/lib/crm/identity";
import { reviewIdentityPieces } from "@/lib/crm/trip-documents";
import { stayHeadline } from "@/lib/crm/carnet";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { StatusChip } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { BookingHero } from "@/components/crm/BookingHero";
import { FilePreviewLink } from "@/components/crm/FilePreview";
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
    stripe,
    whatsappMessages,
    whatsappRequests,
    { data: loginRows, error: loginError },
    { data: activityRows, error: activityError },
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
      .in("kind", ["transfer", "card_payment"])
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
    (async () => {
      try {
        const admin = createServiceClient();
        const [{ data }, { data: people }] = await Promise.all([
          admin
            .from("crm_stripe_transactions")
            .select("*")
            .eq("status", "unmatched")
            .eq("direction", "credit")
            .order("booked_at", { ascending: false, nullsFirst: false })
            .limit(100),
          admin.from("crm_customers").select(STRIPE_MATCH_SELECT),
        ]);
        return {
          rows: (data || []) as CrmStripeTransaction[],
          people: (people || []) as StripeMatchCustomer[],
        };
      } catch {
        return { rows: [] as CrmStripeTransaction[], people: [] as StripeMatchCustomer[] };
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
    supabase
      .from("crm_customer_activity")
      .select("id, customer_id, auth_user_id, action, summary, detail, path, booking_id, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const logins = loginError ? [] : ((loginRows || []) as CrmCustomerLogin[]);
  const activity = activityError ? [] : ((activityRows || []) as CrmCustomerActivity[]);
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
  const piecesToCheck = identityPieces.filter((doc) => {
    const tone = documentExpiryStatus(doc.expires_on).tone;
    return tone === "red" || tone === "amber";
  }).length;
  const piecesSummary = identityPieces.length
    ? `${identityPieces.length} pièce${identityPieces.length > 1 ? "s" : ""}${
        piecesToCheck ? ` · ${piecesToCheck} à vérifier` : " · valides"
      }`
    : "Aucune pièce au coffre.";
  const receipts = filterAgencyReceipts((txs || []) as CrmTransaction[]);
  const balanceRows = (balances || []) as CrmBalance[];
  const travelerCount = 1 + ((companions || []) as CrmCompanion[]).length;
  const lastVisit = formatCustomerLoginAt(logins[0]?.created_at || portal.lastSignInAt) || "Jamais";
  const contactLine = [c.email, c.phone].filter(Boolean).join(" · ");
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
  const stripeSuggestions = suggestionsForStripeCustomer(c, stripe.rows, stripe.people).map((item) => ({
    ...item,
    row: { ...item.row, payer_email: null, raw: {} },
  }));
  return (
    <div className="space-y-5">
      <header className="admin-af-hero-band overflow-hidden rounded-3xl">
        <div className="flex flex-wrap items-end justify-between gap-5 px-6 py-6 sm:px-8">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--admin-gold)]">Fiche client</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-[#faf9f6]">
              {customerFullName(c)}
              {c.on_hold ? (
                <span className="ml-3 align-middle rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                  En veille
                </span>
              ) : null}
            </h1>
            <p className="mt-2 max-w-xl truncate text-sm text-white/70">
              {[contactLine, `Dernière visite · ${lastVisit}`].filter(Boolean).join("  ·  ")}
            </p>
          </div>
          <Link
            href={clientLedgerAdminHref(c.id)}
            className="admin-af-btn-accent inline-flex rounded-full px-5 py-2.5 text-sm"
          >
            Transactions
          </Link>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4 sm:divide-x sm:divide-white/10">
          <Link href={clientLedgerAdminHref(c.id)} className="block px-6 py-4 transition hover:bg-white/5 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              {balanceRows.some((row) => Number(row.balance) > 0) ? "Crédit" : "Encours"}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-[#faf9f6]">
              {balanceRows.length
                ? balanceRows
                    .map((row) => {
                      const value = Number(row.balance);
                      return value > 0
                        ? formatCreditDisponible(value, row.currency)
                        : formatMoney(value, row.currency);
                    })
                    .join(" · ")
                : "—"}
            </p>
          </Link>
          <div className="border-l border-white/10 px-6 py-4 sm:border-0 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Dossiers</p>
            <p className="mt-1 font-display text-xl font-bold text-[#faf9f6]">{activeBookings.length}</p>
          </div>
          <div className="px-6 py-4 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Voyageurs</p>
            <p className="mt-1 font-display text-xl font-bold text-[#faf9f6]">{travelerCount}</p>
          </div>
          <div className="border-l border-white/10 px-6 py-4 sm:border-0 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">Pièces</p>
            <p className="mt-1 font-display text-xl font-bold text-[#faf9f6]">
              {identityPieces.length}
              {piecesToCheck ? (
                <span className="ml-2 align-middle text-xs font-semibold tracking-normal text-[var(--admin-gold)]">
                  {piecesToCheck} à vérifier
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
      <CustomerEditor
        key={c.updated_at}
        customer={c}
        companions={(companions || []) as CrmCompanion[]}
        documents={(documents || []) as CrmTravelDocument[]}
        companyAdmins={(companyAdmins || []) as PickableCustomer[]}
        billingCompanies={(billingCompanies || []) as CrmBillingCompany[]}
      />
      <ClientRevolutSuggestions
        suggestions={revolutSuggestions}
        accounts={
          wireAccountChoices(
            ((billingCompanies || []) as CrmBillingCompany[]).map((company) => ({
              ...company,
              customer_id: c.id,
            }))
          )[c.id] || []
        }
      />
      <ClientStripeSuggestions suggestions={stripeSuggestions} />
      <section className="admin-af-card rounded-3xl px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">Séjours</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Dossiers</h2>
          </div>
          <Link
            href="/admin/reservations/nouveau"
            className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
          >
            Nouveau dossier
          </Link>
        </div>
        {activeBookings.some((row) => row.customer_id !== id) ? (
          <p className="mt-2 text-xs text-muted">
            Les séjours facturés sur ce compte figurent ici, avec le nom du voyageur.
          </p>
        ) : null}
        {activeBookings.length ? (
          <ul className="mt-3 divide-y divide-border text-sm">
            {activeBookings.map((b) => {
              const travelerLine = ficheBookingTravelerLine(b, id, travelerNames);
              return (
                <li key={b.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                  <Link
                    href={`/admin/reservations/${b.id}`}
                    className="flex min-w-0 items-center gap-3 text-[var(--admin-navy)]"
                  >
                    <BookingHero booking={b} places={places.arrival[b.id]} plain className="h-14 w-24 shrink-0 rounded-xl" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {stayHeadline(b.title, b.destination, places.route[b.id])}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {b.reference} · {formatDateFr(b.start_date)}
                        {travelerLine ? ` · ${travelerLine}` : ""}
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <DuplicateBookingButton iconOnly bookingId={b.id} label={`${b.reference} — ${b.title}`} />
                    <ArchiveBookingButton
                      iconOnly
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
          <p className="mt-3 text-sm text-muted">
            Aucun dossier pour ce client. Importez ses confirmations depuis Nouveau dossier.
          </p>
        )}
        {archivedBookings.length ? (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Archivées</h3>
            <ul className="mt-1 divide-y divide-border text-sm">
              {archivedBookings.map((b) => (
                <li key={b.id} className="flex min-w-0 items-center justify-between gap-3 py-2">
                  <Link
                    href={`/admin/reservations/${b.id}`}
                    className="min-w-0 truncate text-[var(--admin-navy)]"
                  >
                    {b.reference} · {stayHeadline(b.title, b.destination, places.route[b.id])}
                  </Link>
                  <RestoreBookingButton iconOnly bookingId={b.id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <CustomerLoginLog logins={logins} activity={activity} />
      <WhatsappThread
        messages={threadMessages}
        requests={whatsappRequests.error ? [] : whatsappRequests.data || []}
        bookings={activeBookings.map((booking) => ({ id: booking.id, reference: booking.reference }))}
      />
        </div>

        <aside className="space-y-3">
      <InviteCustomerPanel customerId={c.id} initial={portal} stacked />
      <details className="admin-af-card group rounded-3xl">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold text-[var(--admin-navy)]">Validation des pièces</span>
            <span className="mt-0.5 block truncate text-sm text-muted">{piecesSummary}</span>
          </span>
          <Icon name="expand_more" className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180" />
        </summary>
        {identityPieces.length ? (
          <ul className="divide-y divide-border border-t border-[var(--border)] px-5 text-sm">
            {identityPieces.map((doc) => {
              const expiry = documentExpiryStatus(doc.expires_on);
              const preview = identityPreview(
                doc,
                [doc.first_name, doc.last_name].filter(Boolean).join(" ") ||
                  DOC_TYPE_LABELS[doc.doc_type] ||
                  "Pièce"
              );
              const who = [doc.first_name, doc.last_name].filter(Boolean).join(" ") || "Titulaire";
              return (
                <li key={doc.id} className="flex min-w-0 items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[var(--admin-navy)]">
                    <span className="font-medium">
                      {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      {doc.number ? ` · ${doc.number}` : ""}
                    </span>
                    <span className="text-muted">
                      {` · ${who}`}
                      {doc.expires_on ? ` · expire le ${formatDateFr(doc.expires_on)}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {preview ? <FilePreviewLink file={preview} /> : null}
                    <StatusChip tone={expiry.tone}>{expiry.label}</StatusChip>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-t border-[var(--border)] px-5 py-4 text-sm text-muted">
            Les passeports et cartes d’identité du foyer apparaîtront ici.
          </p>
        )}
      </details>
      <details className="admin-af-card group rounded-3xl">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold text-[var(--admin-navy)]">Encaissements</span>
            <span className="mt-0.5 block truncate text-sm text-muted">
              {receipts.length
                ? `${receipts.length} versement${receipts.length > 1 ? "s" : ""}`
                : "Aucun encaissement."}
            </span>
          </span>
          <Icon name="expand_more" className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-[var(--border)] px-5 py-3">
          <div className="mb-2 text-right">
            <Link
              href={clientLedgerAdminHref(c.id)}
              className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
            >
              Voir comme le client
            </Link>
          </div>
          {receipts.length ? (
            <ul className="divide-y divide-border text-sm">
              {receipts.map((t) => (
                <li key={t.id} className="flex min-w-0 items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">
                    {t.label} · {formatDateFr(t.occurred_on)}
                  </span>
                  <span className="shrink-0 font-medium text-[var(--admin-navy)]">
                    +{formatMoney(Number(t.amount), t.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Ils apparaissent après rapprochement Revolut, Stripe ou saisie manuelle.
            </p>
          )}
        </div>
      </details>
      {staff.role === "admin" ? <DeleteCustomerButton customerId={c.id} name={customerFullName(c)} /> : null}
        </aside>
      </div>
    </div>
  );
}
