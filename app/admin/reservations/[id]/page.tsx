import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { syncBookingTitleFromSteps } from "@/lib/crm/bookings";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { readEstaAnswers, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { companionsForShare, tripShareUrl } from "@/lib/crm/trip-share";
import { ensureTripShareCode } from "@/lib/crm/trip-share-load";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { isLedgerExpenseKind, visibleServiceCopy } from "@/lib/crm/types";
import { loadClientLedger, type ClientLedgerView } from "@/lib/crm/client-ledger";
import { syncStayCards } from "@/lib/crm/hotel-arrival-run";
import { ensureHotelRequests, loadHotelThread, syncHotelDeskThreads, syncHotelMessages } from "@/lib/crm/hotel-desk-run";
import { principalGuest } from "@/lib/crm/hotel-arrival";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import type {
  CrmBooking,
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
  CrmHotelArrival,
  CrmHotelMessage,
  CrmHotelRequest,
  CrmHotelThreadMessage,
  CrmTravelDocument,
} from "@/lib/crm/types";

type Props = { params: Promise<{ id: string }> };

export default async function AdminBookingPage({ params }: Props) {
  const { id } = await params;
  const { supabase } = await requireStaffPage();
  const { data: booking } = await supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;
  const syncedTitle = await syncBookingTitleFromSteps(supabase, id);
  if (syncedTitle) b.title = syncedTitle;
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
    { data: attachedMails },
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
    supabase
      .from("crm_email_ingest")
      .select("id, subject, from_email, received_at, body_text, extract, warnings")
      .eq("status", "attached")
      .eq("created_booking_id", id)
      .order("received_at", { ascending: false, nullsFirst: false }),
  ]);
  const party = (relatedCustomers || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === b.customer_id) || null;
  const billingCustomer =
    party.find((row) => row.id === (b.billing_customer_id || b.customer_id)) || customer;
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];
  const bookingItems = await loadHotelContacts(id, (items || []) as CrmBookingItem[]);
  let arrivals: CrmHotelArrival[] = [];
  let hotelRequests: CrmHotelRequest[] = [];
  let hotelMessages: CrmHotelMessage[] = [];
  let hotelThreadMessages: CrmHotelThreadMessage[] = [];
  const bookingTravelers = (travelers || []) as CrmBookingTraveler[];
  const guest = principalGuest({
    travelers: bookingTravelers,
    holder: customer ? { first_name: customer.first_name || "", last_name: customer.last_name || "" } : null,
  });
  try {
    const arrivalAdmin = createServiceClient();
    arrivals = await syncStayCards(arrivalAdmin, {
      bookingId: id,
      bookingStatus: b.status,
      currency: b.currency,
      items: bookingItems,
      travelers: bookingTravelers,
      holder: customer ? { first_name: customer.first_name, last_name: customer.last_name } : null,
    });
    hotelRequests = await ensureHotelRequests(arrivalAdmin, {
      bookingId: id,
      reference: b.reference,
      currency: b.currency,
      guest: `${guest.firstName} ${guest.lastName}`.trim(),
      items: bookingItems,
    });
    hotelMessages = await syncHotelMessages(arrivalAdmin, id);
    try {
      await syncHotelDeskThreads(arrivalAdmin, id);
      const [{ data: freshRequests }, { data: freshMessages }, thread] = await Promise.all([
        arrivalAdmin.from("crm_hotel_requests").select("*").eq("booking_id", id),
        arrivalAdmin.from("crm_hotel_messages").select("*").eq("booking_id", id),
        loadHotelThread(arrivalAdmin, id),
      ]);
      if (freshRequests) hotelRequests = freshRequests as CrmHotelRequest[];
      if (freshMessages) hotelMessages = freshMessages as CrmHotelMessage[];
      hotelThreadMessages = thread;
    } catch {
      hotelThreadMessages = [];
    }
  } catch {
    arrivals = [];
    hotelRequests = [];
  }
  const shareCompanions = companionsForShare(bookingTravelers, (companions || []) as CrmCompanion[]);
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

  let ledger: ClientLedgerView | null = null;
  if (customer) {
    try {
      ledger = await loadClientLedger(supabase, customer, "client");
    } catch {
      ledger = null;
    }
  }

  const le = ((leRows || [])[0] || null) as {
    id: string;
    hotel_name: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
  } | null;

  return (
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
          arrivals={arrivals}
          hotelRequests={hotelRequests}
          hotelMessages={hotelMessages}
          hotelThreadMessages={hotelThreadMessages}
          billingCompanies={(billingCompanies || []) as {
            id: string;
            company_name: string | null;
            sort_order: number;
          }[]}
          expenseBilling={bookingItems
            .filter((item) => isLedgerExpenseKind(item.kind))
            .map((item) => ({
              id: item.id,
              title: visibleServiceCopy(item.title),
              billing_company_id: item.billing_company_id || null,
            }))}
          attachedEmails={(attachedMails || []) as {
            id: string;
            subject: string | null;
            from_email: string | null;
            received_at: string | null;
            body_text?: string | null;
            extract?: unknown;
            warnings?: { file?: string | null; message?: string | null }[] | null;
          }[]}
          littleEmperors={le}
          ledger={ledger}
        />
  );
}
