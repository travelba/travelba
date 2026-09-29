import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { DeleteBookingButton } from "@/components/admin/DeleteBookingButton";
import { LittleEmperorsCancel } from "@/components/admin/LittleEmperorsCancel";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { readEstaAnswers, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { formatDateRangeShort, todayIsoDate } from "@/lib/crm/money";
import { companionsForShare, tripShareUrl } from "@/lib/crm/trip-share";
import { ensureTripShareCode } from "@/lib/crm/trip-share-load";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { StayBillingChoice } from "@/components/crm/StayBillingChoice";
import { HotelDeskSummary } from "@/components/admin/HotelDesk";
import { ensureHotelRequests } from "@/lib/crm/hotel-desk-run";
import { principalGuest } from "@/lib/crm/hotel-arrival";
import { passportPreviewsForStay } from "@/lib/crm/preview-files";
import { attachLittleEmperorsCatalog } from "@/lib/crm/hotel-catalog-load";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { isLedgerExpenseKind, visibleServiceCopy } from "@/lib/crm/types";
import type {
  CrmBillingCompany,
  CrmBooking,
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
  CrmHotelRequest,
  CrmTravelDocument,
} from "@/lib/crm/types";

type Props = { params: Promise<{ id: string }> };

export default async function AdminBookingPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage();
  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;
  const relatedIds = Array.from(
    new Set([b.customer_id, b.billing_customer_id].filter((value): value is string => Boolean(value)))
  );
  const [
    { data: items },
    { data: travelers },
    { data: documents },
    { data: companions },
    { data: identityDocs },
    { data: relatedCustomers },
    { data: declined },
    { data: visaRows },
    { data: leRows },
    { data: billingCompanies },
  ] = await Promise.all([
    supabase.from("crm_booking_items").select("*").eq("booking_id", id).order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
    supabase.from("crm_booking_documents").select("*").eq("booking_id", id),
    supabase.from("crm_travel_companions").select("*").eq("customer_id", b.customer_id),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    relatedIds.length
      ? supabase.from("crm_customers").select("*").in("id", relatedIds)
      : Promise.resolve({ data: [] as CrmCustomer[] }),
    supabase.from("crm_declined_services").select("kind, service_leg, place, moment").eq("booking_id", id),
    supabase.from("crm_visa_requests").select("country, step, status, answers, accepted_at").eq("booking_id", id),
    supabase
      .from("crm_le_bookings")
      .select("id, hotel_name, is_cancellable, cancellation_deadline, cancellation_policies, state")
      .eq("crm_booking_id", id)
      .limit(1),
    supabase
      .from("crm_billing_companies")
      .select("id, company_name, sort_order, customer_id")
      .eq("customer_id", b.billing_customer_id || b.customer_id)
      .order("sort_order"),
  ]);
  const party = (relatedCustomers || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === b.customer_id) || null;
  const billingCustomer =
    party.find((row) => row.id === (b.billing_customer_id || b.customer_id)) || customer;
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];
  const bookingItems = await attachLittleEmperorsCatalog(
    await loadHotelContacts(id, (items || []) as CrmBookingItem[])
  );
  let hotelRequests: CrmHotelRequest[] = [];
  const bookingTravelers = (travelers || []) as CrmBookingTraveler[];
  const guest = principalGuest({
    travelers: bookingTravelers,
    holder: customer ? { first_name: customer.first_name || "", last_name: customer.last_name || "" } : null,
  });
  try {
    const arrivalAdmin = createServiceClient();
    hotelRequests = await ensureHotelRequests(arrivalAdmin, {
      bookingId: id,
      reference: b.reference,
      currency: b.currency,
      guest: `${guest.firstName} ${guest.lastName}`.trim(),
      items: bookingItems,
    });
  } catch {
    hotelRequests = [];
  }
  const shareCompanions = companionsForShare(bookingTravelers, (companions || []) as CrmCompanion[]);
  const passportCount = passportPreviewsForStay(bookingTravelers, allIdentity, customer, b.reference).length;
  let shareUrl: string | null = null;
  if (b.visible_to_client) {
    try {
      const shareAdmin = createServiceClient();
      const shareCode = await ensureTripShareCode(shareAdmin, b.id);
      if (shareCode) shareUrl = tripShareUrl(siteConfig.url, shareCode);
    } catch {
      shareUrl = null;
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{b.reference}</p>
          <p className="text-sm font-semibold text-[var(--admin-navy)]">
            {formatDateRangeShort(b.start_date, b.end_date)}
            {b.destination ? ` · ${b.destination}` : ""}
          </p>
          <HotelDeskSummary requests={hotelRequests} today={todayIsoDate()} />
        </div>
        <DeleteBookingButton bookingId={b.id} label={`${b.reference} — ${b.title}`} />
      </div>
      {(leRows || []).slice(0, 1).map((row) => (
        <LittleEmperorsCancel
          key={row.id}
          id={row.id}
          hotelName={row.hotel_name}
          isCancellable={row.is_cancellable}
          deadline={row.cancellation_deadline}
          policies={row.cancellation_policies || []}
          state={row.state}
        />
      ))}
      <div className="mt-6 space-y-6">
        <StayBillingChoice
          endpoint="admin"
          bookingId={b.id}
          companies={(billingCompanies || []) as Pick<CrmBillingCompany, "id" | "company_name">[]}
          bookingCompanyId={b.billing_company_id || null}
          expenses={bookingItems
            .filter((item) => isLedgerExpenseKind(item.kind))
            .map((item) => ({
              id: item.id,
              title: visibleServiceCopy(item.title),
              billing_company_id: item.billing_company_id || null,
            }))}
        />
        <BookingEditor
          booking={b}
          items={bookingItems}
          travelers={bookingTravelers}
          documents={(documents || []) as CrmBookingDocument[]}
          identityDocs={allIdentity}
          companions={(companions || []) as CrmCompanion[]}
          customer={customer}
          billingCustomer={billingCustomer}
          holderName={{
            first_name: customer?.first_name || "",
            last_name: customer?.last_name || "",
          }}
          aiConfigured={aiGatewayConfigured()}
          formalities={frenchPassportTrip(bookingItems, bookingTravelers.length)}
          refusals={refusals}
          visaRequests={((visaRows || []) as { country: string; step?: ClientVisaStep; status?: string; answers?: unknown; accepted_at?: string | null }[]).map(
            (row) => ({
              country: row.country,
              step: row.step,
              status: row.status,
              accepted_at: row.accepted_at,
              answers: readEstaAnswers(row.answers) as Partial<EstaAnswers>,
            })
          )}
          pliantReady={pliantConfigured()}
          shareUrl={shareUrl}
          shareCompanions={shareCompanions}
          hotelRequests={hotelRequests}
          passportCount={passportCount}
        />
      </div>
    </div>
  );
}
