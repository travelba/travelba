import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { ExtrasPanel } from "@/components/crm/ExtrasPanel";
import { VisaSection } from "@/components/crm/VisaSection";
import { findVisaExtra, visaProposed, type ServiceRefusal } from "@/lib/crm/extras";
import { settledFormalityCountries } from "@/lib/crm/visa-cover";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { visaRequestShown, type ClientVisaStep } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { agencyFeeForBooking } from "@/lib/crm/agency-fee-rate";
import { todayIsoDate } from "@/lib/crm/money";
import { insuranceLineLabel, itemPriceLabel, unlinkedDocuments, whatsappModifyHref } from "@/lib/crm/carnet";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { EncoursPayment } from "@/components/account/EncoursPayment";
import { googlePhoneMap } from "@/lib/crm/calendar-ics";
import { ClientTripBody } from "@/components/account/ClientTripBody";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { siteConfig } from "@/lib/site";
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
import { agencyFeeExtraAmounts } from "@/lib/crm/bookings";
import { clientStayExpenseLines, clientStayPriceLabel } from "@/lib/crm/ledger-display";
import { chargeableTicketingFee, isAutoTicketingExpense, ticketingTicketCount } from "@/lib/crm/ticketing-fee";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { stripePublishableKey } from "@/lib/crm/stripe";
import { StayExpenses } from "@/components/account/StayExpenses";
import {
  isActiveItem,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { bookingPayerLabel, type FundingCompany } from "@/lib/crm/funding-wallet";
import { toPublicBooking } from "@/lib/crm/public-booking";
import { clientHotelCancelOffers, type LeCancelRow } from "@/lib/crm/le-free-cancel";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";

type VisaRow = { country: string; step?: ClientVisaStep; status?: string; accepted_at?: string | null };

async function loadLeCancelRows(bookingId: string): Promise<LeCancelRow[]> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("crm_le_bookings")
      .select(
        "id, le_booking_id, confirmation_number, hotel_id, hotel_name, check_in, check_out, state, is_cancellable, cancellation_deadline, cancellation_policies, status"
      )
      .eq("crm_booking_id", bookingId);
    if (error || !data) return [];
    return (data as LeCancelRow[]).map((row) => ({
      ...row,
      le_booking_id: Number(row.le_booking_id),
      cancellation_policies: Array.isArray(row.cancellation_policies) ? row.cancellation_policies : [],
    }));
  } catch {
    return [];
  }
}

/**
 * Hôtel, grand livre et formalités : sous l’en-tête, sans le retenir.
 * Les contacts d’hôtel ne sortent pas sur l’itinéraire.
 */
export async function ClientStayRest({
  supabase,
  customer,
  booking,
  allItems,
  rawItems,
  travelers,
  docs,
  identityDocs,
  companions,
  refusals,
  visaRows,
}: {
  supabase: SupabaseClient;
  customer: CrmCustomer;
  booking: CrmBooking;
  allItems: CrmBookingItem[];
  rawItems: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  docs: CrmBookingDocument[];
  identityDocs: CrmTravelDocument[];
  companions: CrmCompanion[];
  refusals: ServiceRefusal[];
  visaRows: VisaRow[];
}) {
  const b = booking;
  const pub = toPublicBooking(b);
  const party = travelers;
  const visibleDocs = docs;
  const identity = identityDocs;

  const [catalogItems, ledger, settled, expenseChoices, payerCompanies, shareUrl, leRows] = await Promise.all([
    loadHotelContacts(b.id, rawItems),
    loadClientLedger(supabase, customer, "client"),
    settledCountries(b, party, identity, customer),
    loadExpenseChoices(b.id, rawItems),
    loadPayerCompanies(supabase, b),
    loadShareUrl(b.id),
    b.customer_id === customer.id ? loadLeCancelRows(b.id) : Promise.resolve([] as LeCancelRow[]),
  ]);

  const visibleItems = withoutHotelRosterItems(catalogItems);
  const jar = await cookies();
  const desk = Boolean(customer.auth_user_id && deskBypass(jar.get(DESK_COOKIE)?.value, customer.auth_user_id));
  const hotelCancels =
    b.customer_id === customer.id && !desk ? clientHotelCancelOffers(visibleItems, leRows, new Date()) : [];
  const insurances = visibleItems.filter((item) => item.kind === "insurance");
  const coverage = tripDocCoverage(party, identity);
  const missingPassports = coverage.total > 0 && coverage.ready < coverage.total;
  const missingCount = coverage.total - coverage.ready;
  const modifyHref = whatsappModifyHref(siteConfig.whatsappNumber, b.reference, b.destination, {
    title: b.title,
    homeCity: customer.city,
    items: visibleItems,
  });
  const shareCompanions = companionsForShare(party, companions);
  const formalities = frenchPassportTrip(visibleItems, party.length);
  const feeExtras = agencyFeeExtraAmounts(allItems);
  const ticketCount = ticketingTicketCount({
    hasFlight: allItems.some((item) => item.kind === "flight"),
    travelerCount: party.length,
  });
  const ticketingFee = chargeableTicketingFee({
    items: allItems,
    status: b.status,
    travelerCount: party.length,
  });
  const agencyFee = await agencyFeeForBooking(supabase, b);
  const expenseLines = clientStayExpenseLines({
    expenses: expenseChoices,
    agencyCommission: b.agency_commission === true,
    agencyFeeRate: agencyFee.rate,
    stayTotal: Number(b.total_amount),
    currency: b.currency,
    pricesVisible: b.prices_visible !== false,
    extras: feeExtras,
    ticketingFee,
    ticketCount,
  });
  const payerLabel = bookingPayerLabel(b, payerCompanies);
  const encoursPay =
    ledger.member || (ledger.owed.total <= 0 && !ledger.pockets?.some((pocket) => pocket.due >= 0.5)) ? null : (
      <section id="reglement" className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
        <EncoursPayment
          company={ledger.owed.company}
          personal={ledger.owed.personal}
          currency={ledger.currency}
          soleCompanyName={ledger.soleCompanyName}
          stripeKey={stripePublishableKey()}
          pockets={ledger.pockets}
        />
      </section>
    );
  const passportRows = passportVaultRows(
    party,
    identity,
    todayIsoDate(),
    {
      first_name: customer.first_name,
      last_name: customer.last_name,
      usage_name: customer.usage_name,
    },
    b
  );

  return (
    <ClientTripBody
      intro={encoursPay}
      itinerary={
        <CarnetItinerary
          booking={pub}
          items={visibleItems}
          docs={visibleDocs}
          pricesVisible={b.prices_visible !== false}
          calendarBase={`/mon-compte/reservations/${b.reference}/agenda.ics`}
          phones={googlePhoneMap(b, visibleItems)}
          services={{
            variant: "client",
            travelers: party,
            holder: customer,
            companions,
            whatsappHref: modifyHref,
          }}
          refusals={refusals}
          hotelCancels={hotelCancels}
        />
      }
      services={
        <ExtrasPanel
          variant="client"
          booking={pub}
          items={visibleItems}
          travelers={party}
          holder={customer}
          companions={companions}
          whatsappHref={modifyHref}
          formalities={formalities}
          refusals={refusals}
        />
      }
      visaRequest={
        visaRequestShown(b, visaRows) ? (
          <VisaSection
            variant="client"
            bookingId={b.id}
            reference={b.reference}
            trip={formalities}
            requests={visaRows}
            travelers={party}
            documents={identity}
            visaBooked={Boolean(findVisaExtra(visibleItems))}
            pliantReady={pliantConfigured()}
            showReceived={false}
            proposed={visaProposed(b)}
            settled={settled}
          />
        ) : null
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
          {payerLabel ? (
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Réglé par {payerLabel}</p>
          ) : null}
          <p className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
            {clientStayPriceLabel({
              stayTotal: Number(b.total_amount),
              currency: b.currency,
              pricesVisible: b.prices_visible !== false,
              agencyCommission: b.agency_commission === true,
              agencyFeeRate: agencyFee.rate,
              expenses: expenseChoices,
              extras: feeExtras,
              ticketingFee,
            })}
          </p>
          {insurances.map((item) => {
            const price = b.prices_visible !== false ? itemPriceLabel(item, b.currency, null, true) : null;
            return (
              <p key={item.id} className="text-sm text-muted">
                {insuranceLineLabel(item.title)}
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
            attachments={attachmentPreviews(unlinkedDocuments(visibleDocs, visibleItems), visibleItems, b.reference)}
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

export function StayRestSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-28 animate-pulse rounded-2xl bg-[#0B192C]/10" />
      <div className="h-44 animate-pulse rounded-2xl bg-[#0B192C]/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-[#0B192C]/10" />
    </div>
  );
}

async function settledCountries(
  booking: CrmBooking,
  travelers: CrmBookingTraveler[],
  documents: CrmTravelDocument[],
  customer: CrmCustomer
) {
  try {
    return await settledFormalityCountries(createServiceClient(), {
      bookingId: booking.id,
      returnOn: booking.end_date,
      travelers,
      documents,
      holder: {
        first_name: customer.first_name,
        last_name: customer.last_name,
        usage_name: customer.usage_name,
      },
    });
  } catch {
    return [];
  }
}

async function loadExpenseChoices(bookingId: string, fallback: CrmBookingItem[]) {
  try {
    const admin = createServiceClient();
    const { data: expenseRows } = await admin
      .from("crm_booking_items")
      .select("id, title, kind, amount, billing_company_id, sort_order, lifecycle, details")
      .eq("booking_id", bookingId)
      .eq("kind", "expense")
      .order("sort_order");
    return (
      (expenseRows || []) as {
        id: string;
        title: string;
        kind: string;
        amount: number | null;
        billing_company_id: string | null;
        lifecycle?: string | null;
        details?: Record<string, unknown> | null;
      }[]
    )
      .filter((item) => isActiveItem(item) && isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        amount: item.amount == null ? null : Number(item.amount),
        billing_company_id: item.billing_company_id || null,
        agencyFee: !isAutoTicketingExpense(item),
      }));
  } catch {
    return fallback
      .filter((item) => isActiveItem(item) && isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        amount: item.amount == null ? null : Number(item.amount),
        billing_company_id: item.billing_company_id || null,
        agencyFee: !isAutoTicketingExpense(item),
      }));
  }
}

async function loadPayerCompanies(supabase: SupabaseClient, booking: CrmBooking) {
  const { data } = await supabase
    .from("crm_billing_companies")
    .select("id, company_name, funding, sort_order")
    .eq("customer_id", booking.billing_customer_id || booking.customer_id)
    .order("sort_order");
  return (data || []) as FundingCompany[];
}

async function loadShareUrl(bookingId: string) {
  try {
    const shareAdmin = createServiceClient();
    const shareCode = await ensureTripShareCode(shareAdmin, bookingId);
    return shareCode ? tripShareUrl(siteConfig.url, shareCode) : null;
  } catch {
    return null;
  }
}
