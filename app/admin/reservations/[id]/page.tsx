import { notFound } from "next/navigation";
import { Suspense } from "react";
import { redactVaultDocument } from "@/lib/crm/agency-access";
import { staffAllows } from "@/lib/crm/agency-guard";
import { requireStaffPage } from "@/lib/crm/auth";
import { approvedManualTemplates } from "@/lib/crm/whatsapp-inbox";
import { loadCustomerWhatsappMessages } from "@/lib/crm/whatsapp-dock-load";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { DEFAULT_AGENCY_FEE_RATE, loadResolvedAgencyFees } from "@/lib/crm/agency-fee-rate";
import { BookingEditor } from "@/components/admin/BookingEditor";
import { DossierPliantBalance } from "@/components/admin/DossierPliantBalance";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { readEstaAnswers, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { pliantCardForBooking, pliantSpendsForCards, withPliantSpendBookings } from "@/lib/crm/pliant-card-run";
import { pliantBookingCards, pliantCardRecaps } from "@/lib/crm/pliant-booking";
import { hotelDisplayName } from "@/lib/crm/carnet";
import type { PliantCardDraft, PliantSpendLine } from "@/lib/crm/pliant-cards";
import { companionsForShare, isTripShareCode, tripShareUrl } from "@/lib/crm/trip-share";
import { loadEstaForBookingId } from "@/lib/crm/esta-run";
import { readUkEtaLines } from "@/lib/crm/uk-eta-run";
import { buildMb3mInvoiceContext, mb3mInvoiceBlocker } from "@/lib/crm/mb3m-invoice";
import {
  buildTripAccountingView,
  loadDossierAccountingInputs,
  type DossierAccountingInputs,
} from "@/lib/crm/trip-accounting-view";
import type { TripAccountingView } from "@/lib/crm/trip-costs";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { repairCustomerDownloads } from "@/lib/crm/download-journal";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutDebitLine } from "@/lib/crm/revolut-inbox";
import { isLedgerExpenseKind, visibleServiceCopy, type CrmBillingCompany } from "@/lib/crm/types";
import { loadClientLedger, loadClientLedgerViews, type ClientLedgerView } from "@/lib/crm/client-ledger";
import { hotelSignatoryName } from "@/lib/crm/hotel-desk";
import type { StoredFlightCheckin } from "@/lib/crm/online-checkin";
import { loadHotelThread } from "@/lib/crm/hotel-desk-run";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import type {
  CrmBooking,
  CrmBookingCard,
  CrmBookingDocument,
  CrmBookingItem,
  CrmBookingTraveler,
  CrmCompanion,
  CrmCustomer,
  CrmCustomerActivity,
  CrmCustomerLogin,
  CrmHotelArrival,
  CrmHotelMessage,
  CrmHotelRequest,
  CrmHotelThreadMessage,
  CrmRevolutTransaction,
  CrmTravelDocument,
} from "@/lib/crm/types";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hotel?: string | string[]; relance?: string | string[]; repondre?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const { supabase } = await requireStaffPage();
    const { data } = await supabase.from("crm_bookings").select("reference").eq("id", id).maybeSingle();
    const reference = (data as { reference?: string } | null)?.reference;
    return { title: reference ? `Dossier ${reference}` : "Dossier" };
  } catch {
    return { title: "Dossier" };
  }
}

export default async function AdminBookingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const hotelQuery = query.hotel;
  const hotel = Array.isArray(hotelQuery) ? hotelQuery[0] : hotelQuery;
  const openHotelItemId = hotel && /^[0-9a-f-]{36}$/i.test(hotel) ? hotel : null;
  const relanceQuery = query.relance;
  const relance = Array.isArray(relanceQuery) ? relanceQuery[0] : relanceQuery;
  const openRelanceId = relance && /^[0-9a-f-]{36}$/i.test(relance) ? relance : null;
  const replyQuery = query.repondre;
  const reply = Array.isArray(replyQuery) ? replyQuery[0] : replyQuery;
  const openReplyId = reply && /^[0-9a-f-]{36}$/i.test(reply) ? reply : null;
  const { supabase, staff } = await requireStaffPage();
  const signatory = hotelSignatoryName(staff.full_name);
  const { data: booking } = await supabase.from("crm_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;
  await repairCustomerDownloads([b.customer_id]);
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
    { data: loginRows },
    { data: activityRows },
    whatsappMessages,
    whatsappRequests,
    { data: stayRefs },
    { data: ficheCompanyRows },
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
      .select(
        "id, company_name, sort_order, customer_id, funding, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country"
      )
      .eq("customer_id", b.billing_customer_id || b.customer_id)
      .order("sort_order"),
    supabase
      .from("crm_email_ingest")
      .select("id, subject, from_email, received_at, body_text, extract, warnings")
      .eq("status", "attached")
      .eq("created_booking_id", id)
      .order("received_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("crm_customer_logins")
      .select("id, customer_id, auth_user_id, method, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("crm_customer_activity")
      .select("id, customer_id, auth_user_id, action, summary, detail, path, booking_id, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false })
      .limit(200),
    loadCustomerWhatsappMessages(supabase, b.customer_id),
    supabase
      .from("crm_whatsapp_requests")
      .select("id, kind, body, booking_id, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false }),
    supabase.from("crm_bookings").select("id, reference").eq("customer_id", b.customer_id),
    supabase.from("crm_billing_companies").select("*").eq("customer_id", b.customer_id).order("sort_order"),
  ]);
  const ficheBillingCompanies = (ficheCompanyRows || []) as CrmBillingCompany[];
  const customerLogins = (loginRows || []) as CrmCustomerLogin[];
  const customerActivity = (activityRows || []) as CrmCustomerActivity[];
  const threadMessages = whatsappMessages;
  const party = (relatedCustomers || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === b.customer_id) || null;
  const billingCustomer =
    party.find((row) => row.id === (b.billing_customer_id || b.customer_id)) || customer;
  const refusals = ((declined || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];
  const revealPassports = await staffAllows(staff, "passport_reveal");
  const shownIdentity = allIdentity.map((doc) => redactVaultDocument(doc, revealPassports));
  const showMargins = await staffAllows(staff, "view_margins");
  const bookingItems = await loadHotelContacts(id, (items || []) as CrmBookingItem[]);
  let bookingCards: CrmBookingCard[] = [];
  const { data: cardRows, error: cardError } = await supabase
    .from("crm_booking_cards")
    .select(
      "id, booking_id, pliant_card_id, label, first_name, last_name, limit_cents, transaction_limit_cents, max_transaction_count, currency, valid_from, valid_to, last4, status, created_at"
    )
    .eq("booking_id", id)
    .order("created_at", { ascending: true });
  if (!cardError && cardRows) bookingCards = cardRows as CrmBookingCard[];

  const bookingTravelers = (travelers || []) as CrmBookingTraveler[];
  let arrivals: CrmHotelArrival[] = [];
  let hotelRequests: CrmHotelRequest[] = [];
  let hotelMessages: CrmHotelMessage[] = [];
  let hotelThreadMessages: CrmHotelThreadMessage[] = [];
  try {
    const arrivalAdmin = createServiceClient();
    const [arrivalRows, requestRows, messageRows, thread] = await Promise.all([
      arrivalAdmin.from("crm_hotel_arrivals").select("*").eq("booking_id", id),
      arrivalAdmin.from("crm_hotel_requests").select("*").eq("booking_id", id),
      arrivalAdmin.from("crm_hotel_messages").select("*").eq("booking_id", id),
      loadHotelThread(arrivalAdmin, id).catch(() => [] as CrmHotelThreadMessage[]),
    ]);
    if (!arrivalRows.error && arrivalRows.data) arrivals = arrivalRows.data as CrmHotelArrival[];
    if (!requestRows.error && requestRows.data) hotelRequests = requestRows.data as CrmHotelRequest[];
    if (!messageRows.error && messageRows.data) hotelMessages = messageRows.data as CrmHotelMessage[];
    hotelThreadMessages = thread;
  } catch {
    arrivals = [];
    hotelRequests = [];
  }
  let pliantCard: PliantCardDraft | null = null;
  let pliantTabSpends: PliantSpendLine[] = [];
  try {
    const cardAdmin = createServiceClient();
    pliantCard = await pliantCardForBooking(cardAdmin, id);
    pliantTabSpends = await pliantSpendsForCards(
      cardAdmin,
      [
        ...bookingCards.map((card) => card.pliant_card_id),
        ...arrivals.map((row) => row.pliant_card_id || ""),
        pliantCard?.pliant_card_id || "",
      ],
      { limit: null }
    );
    try {
      pliantTabSpends = await withPliantSpendBookings(cardAdmin, pliantTabSpends);
    } catch {
      // Le lien vers la réservation manque ; les transactions restent lisibles.
    }
  } catch {
    pliantCard = null;
    pliantTabSpends = [];
  }
  const hotelNames: Record<string, string> = {};
  for (const item of bookingItems) {
    if (item.kind === "hotel") hotelNames[item.id] = hotelDisplayName(item);
  }
  const pliantRecap = pliantCardRecaps(
    pliantBookingCards({
      bookingCards,
      arrivals,
      hotelNames,
      registry: pliantCard,
    }),
    pliantTabSpends
  );
  const shareCompanions = companionsForShare(bookingTravelers, (companions || []) as CrmCompanion[]);
  const storedShare = (booking as { share_code?: string | null }).share_code;
  const shareUrl =
    b.visible_to_client && storedShare && isTripShareCode(storedShare)
      ? tripShareUrl(siteConfig.url, storedShare)
      : null;

  const accountHolder = billingCustomer || customer;
  const ledgerTask = (async () => {
    let ledger: ClientLedgerView | null = null;
    let accountLedger: ClientLedgerView | null = null;
    if (customer && accountHolder && customer.id === accountHolder.id) {
      const views = await loadClientLedgerViews(supabase, customer, ["client", "staff"]).catch(() => []);
      ledger = views[0] || null;
      accountLedger = views[1] || null;
      return { ledger, accountLedger };
    }
    const [clientView, staffView] = await Promise.all([
      customer ? loadClientLedger(supabase, customer, "client").catch(() => null) : Promise.resolve(null),
      accountHolder
        ? loadClientLedger(supabase, accountHolder, "staff").catch(() => null)
        : Promise.resolve(null),
    ]);
    return { ledger: clientView, accountLedger: staffView };
  })();

  const accountingTask = (async () => {
    const mb3mAdmin = createServiceClient();
    let accountingInputs: DossierAccountingInputs = {
      charges: [],
      pieces: [],
      costs: [],
      coveredIds: [],
      openNumber: null,
    };
    let accounting: TripAccountingView | null = null;
    try {
      accountingInputs = await loadDossierAccountingInputs(mb3mAdmin, id);
      accounting = await buildTripAccountingView(mb3mAdmin, b, bookingItems, accountingInputs);
    } catch (error) {
      console.error("[reservation] comptabilité", error instanceof Error ? error.message : error);
      accounting = null;
    }
    return { accountingInputs, accounting };
  })();
  const [{ ledger, accountLedger }, { accountingInputs, accounting }, estaLines, ukEtaLines] = await Promise.all([
    ledgerTask,
    accountingTask,
    loadEstaForBookingId(createServiceClient(), id).catch(() => []),
    readUkEtaLines(createServiceClient(), id).catch(() => []),
  ]);

  const le = ((leRows || [])[0] || null) as {
    id: string;
    hotel_name: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
  } | null;

  let revolutExpenses: { id: string; label: string; amount: string }[] = [];
  try {
    const { data: outs, error: outsError } = await createServiceClient()
      .from("crm_revolut_transactions")
      .select("id, amount, currency, counterparty_name, reference, booked_at, raw, status, direction")
      .eq("matched_booking_id", id)
      .eq("direction", "debit")
      .eq("status", "matched")
      .order("booked_at", { ascending: false, nullsFirst: false });
    if (!outsError) {
      revolutExpenses = ((outs || []) as CrmRevolutTransaction[]).map((row) => {
        const line = revolutDebitLine(row);
        const when = line.bookedAt ? formatDateFr(line.bookedAt) : "";
        return {
          id: line.id,
          label: [line.party, line.kind, when].filter(Boolean).join(" · "),
          amount: `−${formatMoney(line.amount, line.currency)}`,
        };
      });
    }
  } catch {
    revolutExpenses = [];
  }

  const billingCompanyRows = (billingCompanies || []) as {
    id: string;
    company_name: string | null;
    sort_order: number;
    billing_email?: string | null;
    billing_address_line?: string | null;
    billing_postal_code?: string | null;
    billing_city?: string | null;
    billing_country?: string | null;
  }[];
  const mb3mPiece = accountingInputs.openNumber ? { number: accountingInputs.openNumber } : null;
  const mb3mContext = buildMb3mInvoiceContext({
    booking: b,
    items: bookingItems,
    travelers: bookingTravelers,
    payer: billingCustomer || customer,
    companies: billingCompanyRows,
    charges: accountingInputs.charges,
    coveredIds: accountingInputs.coveredIds,
    costs: accountingInputs.costs,
  });

  const importTasksQuery = await supabase
    .from("crm_booking_tasks")
    .select("id, kind, title")
    .eq("booking_id", id)
    .order("created_at");
  const importTasks = importTasksQuery.error
    ? []
    : ((importTasksQuery.data || []) as { id: string; kind: string; title: string }[]);
  let checkins: StoredFlightCheckin[] = [];
  const checkinRows = await supabase
    .from("crm_flight_checkins")
    .select("booking_item_id, status, actor")
    .eq("booking_id", id);
  if (!checkinRows.error && checkinRows.data) checkins = checkinRows.data as StoredFlightCheckin[];

  const [appliedFees, inheritedFees] = await Promise.all([
    loadResolvedAgencyFees(supabase, [b]),
    loadResolvedAgencyFees(supabase, [{ ...b, agency_fee_rate: null }]),
  ]);
  const appliedFee = appliedFees.get(b.id) || { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" as const };
  const inheritedFee = inheritedFees.get(b.id) || { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" as const };

  return (
    <BookingEditor
          booking={b}
          agencyFee={{
            rate: appliedFee.rate,
            source: appliedFee.source,
            inheritedRate: inheritedFee.rate,
            inheritedSource: inheritedFee.source,
          }}
          items={bookingItems}
          travelers={bookingTravelers}
          documents={(documents || []) as CrmBookingDocument[]}
          identityDocs={shownIdentity}
          showMargins={showMargins}
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
          pliantBalance={
            <Suspense fallback={<p className="rounded-3xl bg-[#faf9f6] px-5 py-4 text-sm text-muted">Solde Pliant…</p>}>
              <DossierPliantBalance />
            </Suspense>
          }
          shareUrl={shareUrl}
          shareCompanions={shareCompanions}
          arrivals={arrivals}
          hotelRequests={hotelRequests}
          hotelSignatory={signatory}
          hotelMessages={hotelMessages}
          hotelThreadMessages={hotelThreadMessages}
          openHotelItemId={openHotelItemId}
          openRelanceId={openRelanceId}
          openReplyId={openReplyId}
          billingCompanies={(billingCompanies || []) as {
            id: string;
            company_name: string | null;
            sort_order: number;
          }[]}
          revolutExpenses={revolutExpenses}
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
          accountLedger={accountLedger}
          bookingCards={bookingCards}
          pliantRecap={pliantRecap}
          estaLines={estaLines}
          ukEtaLines={ukEtaLines}
          whatsappMessages={threadMessages}
          whatsappRequests={whatsappRequests.error ? [] : whatsappRequests.data || []}
          whatsappBookings={(stayRefs || []) as { id: string; reference: string }[]}
          whatsappTemplates={approvedManualTemplates()}
          whatsappPreviewBlocked={isVercelPreview()}
          customerLogins={customerLogins}
          customerActivity={customerActivity}
          ficheBillingCompanies={ficheBillingCompanies}
          mb3m={{ blocker: mb3mInvoiceBlocker(mb3mContext), piece: mb3mPiece }}
          accounting={accounting}
          importTasks={importTasks}
          checkins={checkins}
        />
  );
}
