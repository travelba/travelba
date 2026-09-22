import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { ConciergeBanner, StatusChip, bookingStatusTone } from "@/components/crm/ui";
import { bookingCoverUrl } from "@/lib/crm/covers";
import {
  carnetVisible,
  itemPriceLabel,
  unlinkedDocuments,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
import { CoverPhoto } from "@/components/crm/CoverPhoto";
import { FileOpenLink, fileKindIcon } from "@/components/crm/FileOpen";
import { Icon } from "@/components/crm/icons";
import { TripPassportPicker } from "@/components/crm/TripPassportPicker";
import { PayerChip } from "@/components/crm/PayerChip";
import {
  bookingPayerKind,
  companyDisplayName,
  hasBillingParent,
  isCompanyPaidBooking,
} from "@/lib/crm/company-role";
type Props = { params: Promise<{ reference: string }> };

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;
  await reconcileCustomerParty(customer.id);

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }] = await Promise.all([
    supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", b.id)
      .order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    supabase
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", b.id)
      .eq("visible_to_client", true),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
  ]);

  const visibleItems = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, visibleItems)) notFound();

  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const visibleDocs = (docs || []) as CrmBookingDocument[];
  const extraDocs = unlinkedDocuments(visibleDocs, visibleItems);
  const party = (travelers || []) as CrmBookingTraveler[];
  const coverage = tripDocCoverage(party, (identityDocs || []) as CrmTravelDocument[]);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const modifyHref = whatsappModifyHref(
    siteConfig.whatsappNumber,
    b.reference,
    b.destination
  );
  const cover = bookingCoverUrl(b, 960);
  const headline = b.destination || b.title;
  const sameTitle =
    (b.title || "").trim().toLowerCase() === (b.destination || "").trim().toLowerCase();
  const missingCount = coverage.total - coverage.ready;
  const showPayer = hasBillingParent(customer) || isCompanyPaidBooking(b, customer.id);
  let companyName: string | null = null;
  if (showPayer && isCompanyPaidBooking(b, customer.id)) {
    const payerId = b.billing_customer_id || customer.billing_parent_id;
    if (payerId) {
      const { data: payer } = await supabase
        .from("crm_customers")
        .select("first_name, last_name, company_name")
        .eq("id", payerId)
        .maybeSingle();
      companyName = companyDisplayName(payer as CrmCustomer | null);
    }
  }

  return (
    <div className="space-y-5">
      <Link
        href="/mon-compte/reservations"
        className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
      >
        ← Mes réservations
      </Link>

      <article className="relative min-h-[180px] overflow-hidden rounded-2xl bg-[var(--admin-navy)] text-white shadow-[0_16px_36px_rgba(11,31,58,0.25)]">
        <CoverPhoto src={cover} alt={headline} className="absolute inset-0 h-full w-full object-cover opacity-50" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-transparent" />
        <div className="relative space-y-2 p-4 pb-5 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip tone={bookingStatusTone(b.status)}>
              {BOOKING_STATUS_LABELS[b.status]}
            </StatusChip>
            <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
              {b.reference}
            </span>
          </div>
          <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">{headline}</h1>
          {b.title && !sameTitle ? <p className="text-sm text-white/75">{b.title}</p> : null}
          <p className="text-sm text-white/75">
            {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
          </p>
        </div>
      </article>

      {missingPassports ? (
        <a
          href="#passeport"
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Pièce manquante pour {missingCount} voyageur{missingCount > 1 ? "s" : ""}.
        </a>
      ) : null}

      <TripPassportPicker
        variant="client"
        bookingId={b.id}
        travelers={party}
        documents={(identityDocs || []) as CrmTravelDocument[]}
      />

      {b.notes_client ? (
        <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
          {b.notes_client}
        </p>
      ) : null}

      <CarnetItinerary
        booking={b}
        items={visibleItems}
        docs={visibleDocs}
        calendarBase={`/api/client/bookings/${b.reference}/calendrier`}
      />

      {extraDocs.length ? (
        <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Documents du voyage
          </p>
          <ul className="space-y-2">
            {extraDocs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--admin-navy)]">
                  <Icon
                    name={fileKindIcon(doc.mime_type, doc.file_name)}
                    className="h-5 w-5 shrink-0 text-[var(--admin-gold)]"
                  />
                  <span className="truncate">{doc.file_name || "Document"}</span>
                </span>
                <FileOpenLink
                  path={doc.storage_path}
                  className="inline-flex shrink-0 items-center rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#e5e3dc]"
                >
                  Ouvrir
                </FileOpenLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {formatMoney(Number(b.total_amount), b.currency)}
        </p>
        {showPayer ? (
          <div className="space-y-1">
            <PayerChip kind={bookingPayerKind(b, customer.id)} companyName={companyName} />
            <p className="text-xs text-muted">
              {bookingPayerKind(b, customer.id) === "company"
                ? `Ce séjour est réglé par ${companyName || "la société"}. Il n’entre pas dans votre encours personnel.`
                : "Ce séjour est à votre charge. Il entre dans votre encours personnel."}
            </p>
          </div>
        ) : null}
        {insurances.map((item) => (
          <p key={item.id} className="text-sm text-muted">
            Assurance {item.title}
            {itemPriceLabel(item, b.currency) ? ` · ${itemPriceLabel(item, b.currency)}` : ""}
          </p>
        ))}
      </section>

      <a
        href={modifyHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
      >
        Demander une modification
      </a>

      <ConciergeBanner />
    </div>
  );
}
