import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import {
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { VisaSection } from "@/components/crm/VisaSection";
import { findVisaExtra, serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import type { ClientVisaStep } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { formatDateFr, todayIsoDate } from "@/lib/crm/money";
import { BookingStatusBadge } from "@/components/crm/ui";
import {
  carnetVisible,
  clientBookingStatusLabel,
  clientVisibleItems,
  itemPriceLabel,
  stayArrivalPlaces,
  stayHeadline,
  tripPlaceLine,
  whatsappModifyHref,
} from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { googlePhoneMap } from "@/lib/crm/calendar-ics";
import { ClientTripBody } from "@/components/account/ClientTripBody";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
import { BookingHero } from "@/components/crm/BookingHero";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { attachmentPreviews, passportPreviewsForStay } from "@/lib/crm/preview-files";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { withoutHotelRosterItems } from "@/lib/crm/hotel-contact";
import { createServiceClient } from "@/lib/supabase/admin";
import { TripSharePanel } from "@/components/account/TripSharePanel";
import { TripPassportGroup } from "@/components/crm/TripPassportGroup";
import { ReceivedVisasFold } from "@/components/crm/TripVisaUploads";
import { passportVaultRows } from "@/lib/crm/passport-vault";
import { companionsForShare, tripShareUrl } from "@/lib/crm/trip-share";
import { ensureTripShareCode } from "@/lib/crm/trip-share-load";
import { clientStayExpenseLines, clientStayPriceLabel } from "@/lib/crm/ledger-display";
import { collectableTicketingFee } from "@/lib/crm/ticketing-fee";
import { StayExpenses } from "@/components/account/StayExpenses";
import { isLedgerExpenseKind, visibleServiceCopy } from "@/lib/crm/types";

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
  if (b.archived_at) notFound();

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

  const rawItems = clientVisibleItems((items || []) as CrmBookingItem[]);
  if (!carnetVisible(b, rawItems)) notFound();
  const visibleItems = withoutHotelRosterItems(await loadHotelContacts(b.id, rawItems));

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
  const shareCompanions = companionsForShare(party, (companions || []) as CrmCompanion[]);
  let shareUrl: string | null = null;
  try {
    const shareAdmin = createServiceClient();
    const shareCode = await ensureTripShareCode(shareAdmin, b.id);
    if (shareCode) shareUrl = tripShareUrl(siteConfig.url, shareCode);
  } catch {
    shareUrl = null;
  }
  const headline = stayHeadline(
    b.title,
    b.destination,
    stayArrivalPlaces(b.destination, b.title, visibleItems)
  );
  const placeLine = tripPlaceLine(b.title, b.destination);
  const missingCount = coverage.total - coverage.ready;
  const formalities = frenchPassportTrip(visibleItems, party.length);
  let expenseChoices: { id: string; title: string; amount: number | null; billing_company_id: string | null }[] =
    [];
  try {
    const admin = createServiceClient();
    const { data: expenseRows } = await admin
      .from("crm_booking_items")
      .select("id, title, kind, amount, billing_company_id, sort_order")
      .eq("booking_id", b.id)
      .eq("kind", "expense")
      .order("sort_order");
    expenseChoices = (
      (expenseRows || []) as {
        id: string;
        title: string;
        kind: string;
        amount: number | null;
        billing_company_id: string | null;
      }[]
    )
      .filter((item) => isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        amount: item.amount == null ? null : Number(item.amount),
        billing_company_id: item.billing_company_id || null,
      }));
  } catch {
    expenseChoices = visibleItems
      .filter((item) => isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        amount: item.amount == null ? null : Number(item.amount),
        billing_company_id: item.billing_company_id || null,
      }));
  }
  const ticketingFee = collectableTicketingFee({
    status: b.status,
    hasFlight: ((items || []) as CrmBookingItem[]).some((item) => item.kind === "flight"),
  });
  const expenseLines = clientStayExpenseLines({
    expenses: expenseChoices,
    agencyCommission: b.agency_commission === true,
    stayTotal: Number(b.total_amount),
    currency: b.currency,
    pricesVisible: b.prices_visible !== false,
    ticketingFee,
  });

  const identity = (identityDocs || []) as CrmTravelDocument[];
  const passportRows = passportVaultRows(party, identity, todayIsoDate(), {
    first_name: customer.first_name,
    last_name: customer.last_name,
    usage_name: customer.usage_name,
  });

  return (
    <ClientTripBody
      intro={
        <>
          <Link
            href="/mon-compte/reservations"
            className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
          >
            ← Mes réservations
          </Link>

          <BookingHero
            booking={b}
            items={withoutHotelRosterItems((items || []) as CrmBookingItem[])}
            priority
            className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
          >
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <BookingStatusBadge label={clientBookingStatusLabel(b.status)} />
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

          {b.notes_client ? (
            <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
              {b.notes_client}
            </p>
          ) : null}
        </>
      }
      itinerary={
        <CarnetItinerary
          booking={b}
          items={visibleItems}
          docs={visibleDocs}
          pricesVisible={b.prices_visible !== false}
          calendarBase={`/mon-compte/reservations/${b.reference}/agenda.ics`}
          phones={googlePhoneMap(b, visibleItems)}
          services={{
            variant: "client",
            travelers: party,
            holder: customer,
            companions: (companions || []) as CrmCompanion[],
            whatsappHref: modifyHref,
          }}
          refusals={refusals}
        />
      }
      services={
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
      }
      visaRequest={
        <VisaSection
          variant="client"
          bookingId={b.id}
          reference={b.reference}
          trip={formalities}
          requests={(visaRows || []) as { country: string; step?: ClientVisaStep; status?: string; accepted_at?: string | null }[]}
          travelers={party}
          documents={identity}
          visaBooked={Boolean(findVisaExtra(visibleItems))}
          pliantReady={pliantConfigured()}
          showReceived={false}
        />
      }
      receivedVisas={
        <ReceivedVisasFold
          folded
          variant="client"
          bookingId={b.id}
          reference={b.reference}
          travelers={party}
          documents={identity}
          entries={formalities.entries}
        />
      }
      passports={
        <TripPassportGroup
          rows={passportRows}
          hrefFor={() => "/mon-compte/profil/documents"}
          passports={passportPreviewsForStay(party, identity, customer, b.reference)}
          missingHref="/mon-compte/profil/documents"
          missingCount={missingPassports ? missingCount : 0}
        />
      }
      share={
        shareUrl ? (
          <TripSharePanel
            bookingId={b.id}
            shareUrl={shareUrl}
            companions={shareCompanions}
            canSend={Boolean(customer.phone)}
          />
        ) : null
      }
      amount={
        <section className="aura-card space-y-2 rounded-[1.35rem] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Montant du séjour
          </p>
          <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
            {clientStayPriceLabel({
              stayTotal: Number(b.total_amount),
              currency: b.currency,
              pricesVisible: b.prices_visible !== false,
              agencyCommission: b.agency_commission === true,
              expenses: expenseChoices,
              ticketingFee,
            })}
          </p>
          {insurances.map((item) => {
            const price = itemPriceLabel(item, b.currency, null, b.prices_visible !== false);
            return (
              <p key={item.id} className="text-sm text-muted">
                Assurance {item.title}
                {price ? ` · ${price}` : ""}
              </p>
            );
          })}
        </section>
      }
      expenses={expenseLines.length ? <StayExpenses lines={expenseLines} /> : null}
      tail={
        <>
          <ReservationFiles
            showPassports={false}
            attachments={attachmentPreviews(visibleDocs, visibleItems, b.reference)}
          />
          {customer.phone ? (
            <a
              href={modifyHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
            >
              Modifier ce voyage
            </a>
          ) : null}
        </>
      }
    />
  );
}
