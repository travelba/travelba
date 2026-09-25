import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { VisaSection } from "@/components/crm/VisaSection";
import { bookingHasFlight, findVisaExtra, serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import type { ClientVisaStep } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { BookingStatusBadge } from "@/components/crm/ui";
import {
  carnetVisible,
  itemPriceLabel,
  tripHeadline,
  tripPlaceLine,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
import { BookingHero } from "@/components/crm/BookingHero";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { StayBillingChoice } from "@/components/crm/StayBillingChoice";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { createServiceClient } from "@/lib/supabase/admin";
import { isLedgerExpenseKind, visibleServiceCopy, type CrmBillingCompany } from "@/lib/crm/types";

type Props = { params: Promise<{ reference: string }> };

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const { supabase, user } = await getSessionUser();
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

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }, { data: companions }, { data: declined }, { data: visaRows }] =
    await Promise.all([
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
    supabase.from("crm_travel_companions").select("*").eq("customer_id", customer.id),
    supabase.from("crm_declined_services").select("kind, service_leg, place, moment").eq("booking_id", b.id),
    supabase.from("crm_visa_requests").select("country, step, status, accepted_at").eq("booking_id", b.id),
  ]);
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));

  const rawItems = (items || []) as CrmBookingItem[];
  if (!carnetVisible(b, rawItems)) notFound();
  const visibleItems = await loadHotelContacts(b.id, rawItems);

  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const visibleDocs = (docs || []) as CrmBookingDocument[];
  const party = (travelers || []) as CrmBookingTraveler[];
  const coverage = tripDocCoverage(party, (identityDocs || []) as CrmTravelDocument[]);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const modifyHref = whatsappModifyHref(
    siteConfig.whatsappNumber,
    b.reference,
    b.destination
  );
  const headline = tripHeadline(b.title, b.destination);
  const placeLine = tripPlaceLine(b.title, b.destination);
  const missingCount = coverage.total - coverage.ready;
  const formalities = frenchPassportTrip(visibleItems, party.length);
  let billingCompanies: Pick<CrmBillingCompany, "id" | "company_name">[] = [];
  let expenseChoices: { id: string; title: string; billing_company_id: string | null }[] = [];
  try {
    const admin = createServiceClient();
    const payerId = b.billing_customer_id || customer.id;
    const [{ data: companyRows }, { data: expenseRows }] = await Promise.all([
      admin
        .from("crm_billing_companies")
        .select("id, company_name, sort_order")
        .eq("customer_id", payerId)
        .order("sort_order"),
      admin
        .from("crm_booking_items")
        .select("id, title, kind, billing_company_id")
        .eq("booking_id", b.id)
        .eq("kind", "expense"),
    ]);
    billingCompanies = (companyRows || []) as Pick<CrmBillingCompany, "id" | "company_name">[];
    expenseChoices = ((expenseRows || []) as { id: string; title: string; kind: string; billing_company_id: string | null }[])
      .filter((item) => isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        billing_company_id: item.billing_company_id || null,
      }));
  } catch {
    billingCompanies = [];
    expenseChoices = [];
  }

  return (
    <div className="space-y-5">
      <Link
        href="/mon-compte/reservations"
        className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
      >
        ← Mes réservations
      </Link>

      <BookingHero
        booking={b}
        priority
        className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
      >
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <BookingStatusBadge label={BOOKING_STATUS_LABELS[b.status]} />
            <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
              {b.reference}
            </span>
          </div>
          <div>
            <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">{headline}</h1>
            {placeLine ? <p className="text-sm text-white/75">{placeLine}</p> : null}
            <p className="text-sm text-white/75">
              {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
            </p>
          </div>
        </div>
      </BookingHero>

      {missingPassports ? (
        <a
          href="/mon-compte/profil/documents"
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Pièce manquante pour {missingCount} voyageur{missingCount > 1 ? "s" : ""}.
        </a>
      ) : null}

      <StayBillingChoice
        endpoint="client"
        bookingId={b.id}
        companies={billingCompanies}
        bookingCompanyId={b.billing_company_id || null}
        expenses={expenseChoices}
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
        calendarBase={`/mon-compte/reservations/${b.reference}/agenda.ics`}
        services={{
          variant: "client",
          travelers: party,
          holder: customer,
          companions: (companions || []) as CrmCompanion[],
          whatsappHref: modifyHref,
        }}
        refusals={refusals}
      />

      <ReservationFiles
        passports={passportPreviewsForStay(
          party,
          (identityDocs || []) as CrmTravelDocument[],
          customer,
          b.reference
        )}
        attachments={attachmentPreviews(visibleDocs, visibleItems, b.reference)}
      />

      {bookingHasFlight(visibleItems) ? (
        <ExtrasPanel
          variant="client"
          booking={b}
          items={visibleItems}
          travelers={party}
          holder={customer}
          companions={(companions || []) as CrmCompanion[]}
          whatsappHref={modifyHref}
          formalities={formalities}
          refusals={refusals}
        />
      ) : null}

      <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Montant du séjour
        </p>
        <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
          {b.prices_visible === false ? "Prix à la publication" : formatMoney(Number(b.total_amount), b.currency)}
        </p>
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

      {bookingHasFlight(visibleItems) ? (
        <VisaSection
          variant="client"
          bookingId={b.id}
          reference={b.reference}
          trip={formalities}
          requests={(visaRows || []) as { country: string; step?: ClientVisaStep; status?: string; accepted_at?: string | null }[]}
          travelers={party}
          documents={(identityDocs || []) as CrmTravelDocument[]}
          visaBooked={Boolean(findVisaExtra(visibleItems))}
          pliantReady={pliantConfigured()}
        />
      ) : null}
    </div>
  );
}
