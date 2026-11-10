import "server-only";

import { staffAllows } from "@/lib/crm/agency-guard";
import { DEFAULT_AGENCY_FEE_RATE, loadResolvedAgencyFees } from "@/lib/crm/agency-fee-rate";
import { loadStaffNames } from "@/lib/crm/dossier-responsables";
import { DEFAULT_EXPENSE_PRESETS } from "@/lib/crm/expense-presets";
import { loadExpensePresets, presetsForDossier } from "@/lib/crm/expense-presets-db";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import { frenchPassportTrip } from "@/lib/crm/visa-trip";
import { readEstaAnswers, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import { pliantConfigured } from "@/lib/crm/pliant";
import { pliantCardForBooking, pliantSpendsForCards, withPliantSpendBookings } from "@/lib/crm/pliant-card-run";
import { hotelDisplayName } from "@/lib/crm/carnet";
import type { PliantCardDraft, PliantSpendLine } from "@/lib/crm/pliant-cards";
import { pliantBookingCards, pliantCardRecaps } from "@/lib/crm/pliant-booking";
import { companionsForShare, isTripShareCode, tripShareUrl } from "@/lib/crm/trip-share";
import { loadEstaForBookingId } from "@/lib/crm/esta-run";
import { readUkEtaLines } from "@/lib/crm/uk-eta-run";
import { buildMb3mInvoiceContext, mb3mInvoiceBlocker } from "@/lib/crm/mb3m-invoice";
import { mb3mRealm } from "@/lib/crm/mb3m";
import { mb3mPreparationFromRow } from "@/lib/crm/mb3m-prep";
import {
  buildTripAccountingView,
  loadDossierAccountingInputs,
  type DossierAccountingInputs,
} from "@/lib/crm/trip-accounting-view";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { serviceRefusalFromRow, type ServiceRefusal } from "@/lib/crm/extras";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { revolutDebitLine } from "@/lib/crm/revolut-inbox";
import { isLedgerExpenseKind, visibleServiceCopy, type CrmBillingCompany } from "@/lib/crm/types";
import type { ClientLedgerView } from "@/lib/crm/client-ledger";
import { loadClientLedger, loadClientLedgerViews } from "@/lib/crm/client-ledger-load";
import { hotelSignatoryName } from "@/lib/crm/hotel-desk";
import type { StoredFlightCheckin } from "@/lib/crm/online-checkin";
import { loadHotelThread } from "@/lib/crm/hotel-desk-run";
import { loadHotelContacts } from "@/lib/crm/hotel-contact-load";
import { redactVaultDocument } from "@/lib/crm/agency-access";
import { loadCustomerWhatsappMessages } from "@/lib/crm/whatsapp-dock-load";
import { approvedManualTemplates } from "@/lib/crm/whatsapp-inbox";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  CrmStaff,
  CrmTravelDocument,
} from "@/lib/crm/types";

const EMPTY_ACCOUNTING: DossierAccountingInputs = {
  charges: [],
  pieces: [],
  costs: [],
  coveredIds: [],
  openNumber: null,
};

export type DeferredBookingLedger = {
  ledger: ClientLedgerView | null;
  accountLedger: ClientLedgerView | null;
};

async function wave<T extends Record<string, PromiseLike<unknown>>>(tasks: T): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(tasks) as (keyof T)[];
  const values = await Promise.all(keys.map((key) => tasks[key]));
  const result = {} as { [K in keyof T]: Awaited<T[K]> };
  keys.forEach((key, index) => {
    result[key] = values[index] as { [K in keyof T]: Awaited<T[K]> }[typeof key];
  });
  return result;
}

async function bookingLedgers(
  supabase: SupabaseClient,
  customer: CrmCustomer | null,
  billingCustomer: CrmCustomer | null,
  reconcile: boolean
) {
  const options = { reconcile };
  const accountHolder = billingCustomer || customer;
  if (customer && accountHolder && customer.id === accountHolder.id) {
    const views = await loadClientLedgerViews(supabase, customer, ["client", "staff"], options).catch(() => []);
    return { ledger: views[0] || null, accountLedger: views[1] || null };
  }
  const [ledger, accountLedger] = await Promise.all([
    customer ? loadClientLedger(supabase, customer, "client", options).catch(() => null) : Promise.resolve(null),
    accountHolder
      ? loadClientLedger(supabase, accountHolder, "staff", options).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { ledger, accountLedger };
}

async function customersForBooking(supabase: SupabaseClient, booking: CrmBooking) {
  const relatedIds = Array.from(
    new Set([booking.customer_id, booking.billing_customer_id].filter((value): value is string => Boolean(value)))
  );
  if (!relatedIds.length) return [] as CrmCustomer[];
  const { data } = await supabase.from("crm_customers").select("*").in("id", relatedIds);
  return (data || []) as CrmCustomer[];
}

export async function reconciledBookingLedger(supabase: SupabaseClient, booking: CrmBooking): Promise<DeferredBookingLedger> {
  const party = await customersForBooking(supabase, booking);
  const customer = party.find((row) => row.id === booking.customer_id) || null;
  const billingCustomer = party.find((row) => row.id === (booking.billing_customer_id || booking.customer_id)) || customer;
  return bookingLedgers(supabase, customer, billingCustomer, true);
}

export async function enrichedBookingHotels(bookingId: string) {
  const admin = createServiceClient();
  const { data } = await admin.from("crm_booking_items").select("*").eq("booking_id", bookingId).order("sort_order");
  const items = (data || []) as CrmBookingItem[];
  if (!items.some((item) => item.kind === "hotel")) return null;
  return loadHotelContacts(bookingId, items);
}

async function loadArrivals(bookingId: string) {
  let arrivals: CrmHotelArrival[] = [];
  let hotelRequests: CrmHotelRequest[] = [];
  let hotelMessages: CrmHotelMessage[] = [];
  let hotelThreadMessages: CrmHotelThreadMessage[] = [];
  try {
    const admin = createServiceClient();
    const [arrivalRows, requestRows, messageRows, thread] = await Promise.all([
      admin.from("crm_hotel_arrivals").select("*").eq("booking_id", bookingId),
      admin.from("crm_hotel_requests").select("*").eq("booking_id", bookingId),
      admin.from("crm_hotel_messages").select("*").eq("booking_id", bookingId),
      loadHotelThread(admin, bookingId).catch(() => [] as CrmHotelThreadMessage[]),
    ]);
    if (!arrivalRows.error && arrivalRows.data) arrivals = arrivalRows.data as CrmHotelArrival[];
    if (!requestRows.error && requestRows.data) hotelRequests = requestRows.data as CrmHotelRequest[];
    if (!messageRows.error && messageRows.data) hotelMessages = messageRows.data as CrmHotelMessage[];
    hotelThreadMessages = thread;
  } catch {
    arrivals = [];
    hotelRequests = [];
  }
  return { arrivals, hotelRequests, hotelMessages, hotelThreadMessages };
}

async function loadRevolutExpenses(bookingId: string) {
  try {
    const { data, error } = await createServiceClient()
      .from("crm_revolut_transactions")
      .select("id, amount, currency, counterparty_name, reference, booked_at, raw, status, direction")
      .eq("matched_booking_id", bookingId)
      .eq("direction", "debit")
      .eq("status", "matched")
      .order("booked_at", { ascending: false, nullsFirst: false });
    if (error) return [];
    return ((data || []) as CrmRevolutTransaction[]).map((row) => {
      const line = revolutDebitLine(row);
      const when = line.bookedAt ? formatDateFr(line.bookedAt) : "";
      return {
        id: line.id,
        label: [line.party, line.kind, when].filter(Boolean).join(" · "),
        amount: `−${formatMoney(line.amount, line.currency)}`,
      };
    });
  } catch {
    return [];
  }
}

export async function loadAdminBookingCritical(input: {
  supabase: SupabaseClient;
  staff: CrmStaff;
  booking: CrmBooking;
  openHotelItemId: string | null;
  openRelanceId: string | null;
  openReplyId: string | null;
}) {
  const { supabase, staff, booking: b } = input;
  const id = b.id;
  const relatedIds = Array.from(
    new Set([b.customer_id, b.billing_customer_id].filter((value): value is string => Boolean(value)))
  );
  const ownerRow = b as CrmBooking & { owner_staff_id?: string | null; created_by_staff_id?: string | null };
  const first = await wave({
    items: supabase.from("crm_booking_items").select("*").eq("booking_id", id).order("sort_order"),
    travelers: supabase.from("crm_booking_travelers").select("*").eq("booking_id", id),
    documents: supabase.from("crm_booking_documents").select("*").eq("booking_id", id),
    companions: supabase.from("crm_travel_companions").select("*").eq("customer_id", b.customer_id),
    identityDocs: supabase.from("crm_travel_documents").select("*").eq("customer_id", b.customer_id),
    relatedCustomers: relatedIds.length
      ? supabase.from("crm_customers").select("*").in("id", relatedIds)
      : Promise.resolve({ data: [] as CrmCustomer[] }),
    declined: supabase.from("crm_declined_services").select("kind, service_leg, place, moment").eq("booking_id", id),
    visaRows: supabase
      .from("crm_visa_requests")
      .select("country, step, status, answers, accepted_at, launched_by_name")
      .eq("booking_id", id),
    leRows: supabase
      .from("crm_le_bookings")
      .select("id, hotel_name, check_in, total_cost, currency, is_cancellable, cancellation_deadline, cancellation_policies, state, created_at")
      .eq("crm_booking_id", id)
      .limit(20),
    billingCompanies: supabase
      .from("crm_billing_companies")
      .select(
        "id, company_name, sort_order, customer_id, funding, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country"
      )
      .eq("customer_id", b.billing_customer_id || b.customer_id)
      .order("sort_order"),
    attachedMails: supabase
      .from("crm_email_ingest")
      .select("id, subject, from_email, received_at, body_text, extract, warnings")
      .eq("status", "attached")
      .eq("created_booking_id", id)
      .order("received_at", { ascending: false, nullsFirst: false }),
    loginRows: supabase
      .from("crm_customer_logins")
      .select("id, customer_id, auth_user_id, method, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false })
      .limit(80),
    activityRows: supabase
      .from("crm_customer_activity")
      .select("id, customer_id, auth_user_id, action, summary, detail, path, booking_id, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false })
      .limit(200),
    whatsappMessages: loadCustomerWhatsappMessages(supabase, b.customer_id),
    whatsappRequests: supabase
      .from("crm_whatsapp_requests")
      .select("id, kind, body, booking_id, created_at")
      .eq("customer_id", b.customer_id)
      .order("created_at", { ascending: false }),
    stayRefs: supabase.from("crm_bookings").select("id, reference").eq("customer_id", b.customer_id),
    ficheCompanyRows: supabase.from("crm_billing_companies").select("*").eq("customer_id", b.customer_id).order("sort_order"),
    revealPassports: staffAllows(staff, "passport_reveal"),
    showMargins: staffAllows(staff, "view_margins"),
    staffNames: loadStaffNames(createServiceClient(), [ownerRow.owner_staff_id, ownerRow.created_by_staff_id]),
    cards: supabase
      .from("crm_booking_cards")
      .select(
        "id, booking_id, pliant_card_id, label, first_name, last_name, limit_cents, transaction_limit_cents, max_transaction_count, currency, valid_from, valid_to, last4, status, created_at"
      )
      .eq("booking_id", id)
      .order("created_at", { ascending: true }),
    hotelDesk: loadArrivals(id),
    pliantCard: pliantCardForBooking(createServiceClient(), id).catch(() => null as PliantCardDraft | null),
    estaLines: loadEstaForBookingId(createServiceClient(), id).catch(() => []),
    ukEtaLines: readUkEtaLines(createServiceClient(), id).catch(() => []),
    revolutExpenses: loadRevolutExpenses(id),
    accountingInputs: loadDossierAccountingInputs(createServiceClient(), id).catch((error: unknown) => {
      console.error("[reservation] comptabilité", error instanceof Error ? error.message : error);
      return EMPTY_ACCOUNTING;
    }),
    gdsPieces: createServiceClient()
      .from("crm_mb3m_pieces")
      .select("piece_number, lines")
      .eq("booking_id", id)
      .eq("kind", "gds")
      .eq("realm", mb3mRealm()),
    importTasks: supabase.from("crm_booking_tasks").select("id, kind, title").eq("booking_id", id).order("created_at"),
    checkins: supabase.from("crm_flight_checkins").select("booking_item_id, status, actor").eq("booking_id", id),
    appliedFees: loadResolvedAgencyFees(supabase, [b]),
    inheritedFees: loadResolvedAgencyFees(supabase, [{ ...b, agency_fee_rate: null }]),
    presetLoad: loadExpensePresets(supabase).catch(() => null),
  });

  const rawItems = (gotItems(first.items) || []) as CrmBookingItem[];
  const party = (first.relatedCustomers.data || []) as CrmCustomer[];
  const customer = party.find((row) => row.id === b.customer_id) || null;
  const billingCustomer = party.find((row) => row.id === (b.billing_customer_id || b.customer_id)) || customer;
  const bookingCards = first.cards.error || !first.cards.data ? [] : (first.cards.data as CrmBookingCard[]);
  const { arrivals, hotelRequests, hotelMessages, hotelThreadMessages } = first.hotelDesk;

  const second = await wave({
    bookingItems: loadHotelContacts(id, rawItems, { live: false }),
    ledgers: bookingLedgers(supabase, customer, billingCustomer, false),
    spends: loadPliantSpends(bookingCards, arrivals, first.pliantCard),
    accounting: buildTripAccountingView(createServiceClient(), b, rawItems, first.accountingInputs).catch((error: unknown) => {
      console.error("[reservation] comptabilité", error instanceof Error ? error.message : error);
      return null;
    }),
  });

  const bookingItems = second.bookingItems;
  const allIdentity = (first.identityDocs.data || []) as CrmTravelDocument[];
  const bookingTravelers = (first.travelers.data || []) as CrmBookingTraveler[];
  const billingCompanyRows = (first.billingCompanies.data || []) as {
    id: string;
    company_name: string | null;
    sort_order: number;
    billing_email?: string | null;
    billing_address_line?: string | null;
    billing_postal_code?: string | null;
    billing_city?: string | null;
    billing_country?: string | null;
  }[];
  const leList = (first.leRows.data || []) as {
    id: string;
    hotel_name: string | null;
    check_in: string | null;
    total_cost: string | null;
    currency: string | null;
    is_cancellable: boolean | null;
    cancellation_deadline: string | null;
    cancellation_policies: string[] | null;
    state: string | null;
    created_at: string | null;
  }[];
  const hotelNames: Record<string, string> = {};
  for (const item of bookingItems) {
    if (item.kind === "hotel") hotelNames[item.id] = hotelDisplayName(item);
  }
  const pliantRecap = pliantCardRecaps(
    pliantBookingCards({
      bookingCards,
      arrivals,
      hotelNames,
      registry: first.pliantCard,
    }),
    second.spends
  );
  const storedShare = (b as CrmBooking & { share_code?: string | null }).share_code;
  const shareUrl =
    b.visible_to_client && storedShare && isTripShareCode(storedShare) ? tripShareUrl(siteConfig.url, storedShare) : null;
  const accountingInputs = first.accountingInputs;
  const mb3mPiece = accountingInputs.openNumber ? { number: accountingInputs.openNumber } : null;
  const mb3mDraft = accountingInputs.pieces.find((row) => !row.printed_at && !(row.piece_number || "").trim()) || null;
  const amadeus = ((first.gdsPieces.data || []) as { piece_number: string | null; lines: unknown }[]).flatMap((row) => {
    const line = Array.isArray(row.lines) ? (row.lines[0] as { label?: string; placement?: string } | undefined) : undefined;
    const placement: "move" | "here" | "other" =
      line?.placement === "move" || line?.placement === "other" ? line.placement : "here";
    const number = (row.piece_number || "").trim();
    if (!number) return [];
    return [{ label: (line?.label || "Vol").trim(), invoiceNumber: number, placement }];
  });
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
  const appliedFee = first.appliedFees.get(b.id) || { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" as const };
  const inheritedFee = first.inheritedFees.get(b.id) || { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" as const };
  const refusals = ((first.declined.data || []) as { kind?: string | null; service_leg?: string | null; place?: string | null; moment?: string | null }[])
    .map(serviceRefusalFromRow)
    .filter((row): row is ServiceRefusal => Boolean(row));

  return {
    booking: b,
    agencyFee: {
      rate: appliedFee.rate,
      source: appliedFee.source,
      inheritedRate: inheritedFee.rate,
      inheritedSource: inheritedFee.source,
    },
    expensePresets: first.presetLoad ? presetsForDossier(first.presetLoad) : [...DEFAULT_EXPENSE_PRESETS],
    items: bookingItems,
    travelers: bookingTravelers,
    documents: (first.documents.data || []) as CrmBookingDocument[],
    identityDocs: allIdentity.map((doc) => redactVaultDocument(doc, first.revealPassports)),
    showMargins: first.showMargins,
    ownership: {
      owner: ownerRow.owner_staff_id ? first.staffNames.get(ownerRow.owner_staff_id) || "Collègue" : null,
      createdBy: ownerRow.created_by_staff_id ? first.staffNames.get(ownerRow.created_by_staff_id) || "Collègue" : null,
    },
    companions: (first.companions.data || []) as CrmCompanion[],
    customer,
    billingCustomer,
    holderName: {
      first_name: customer?.first_name || "",
      last_name: customer?.last_name || "",
    },
    aiConfigured: aiGatewayConfigured(),
    formalities: frenchPassportTrip(bookingItems, bookingTravelers.length),
    refusals,
    visaRequests: ((first.visaRows.data || []) as {
      country: string;
      step?: ClientVisaStep;
      status?: string;
      answers?: unknown;
      accepted_at?: string | null;
      launched_by_name?: string | null;
    }[]).map((row) => ({
      country: row.country,
      step: row.step,
      status: row.status,
      accepted_at: row.accepted_at,
      launched_by_name: row.launched_by_name,
      answers: readEstaAnswers(row.answers) as Partial<EstaAnswers>,
    })),
    pliantReady: pliantConfigured(),
    shareUrl,
    shareCompanions: companionsForShare(bookingTravelers, (first.companions.data || []) as CrmCompanion[]),
    arrivals,
    hotelRequests,
    hotelSignatory: hotelSignatoryName(staff.full_name),
    hotelMessages,
    hotelThreadMessages,
    openHotelItemId: input.openHotelItemId,
    openRelanceId: input.openRelanceId,
    openReplyId: input.openReplyId,
    billingCompanies: billingCompanyRows,
    revolutExpenses: first.revolutExpenses,
    expenseBilling: bookingItems
      .filter((item) => isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        billing_company_id: item.billing_company_id || null,
      })),
    attachedEmails: (first.attachedMails.data || []) as {
      id: string;
      subject: string | null;
      from_email: string | null;
      received_at: string | null;
      body_text?: string | null;
      extract?: unknown;
      warnings?: { file?: string | null; message?: string | null }[] | null;
    }[],
    littleEmperors: leList[0] || null,
    leStays: leList,
    ledger: second.ledgers.ledger,
    accountLedger: second.ledgers.accountLedger,
    bookingCards,
    pliantRecap,
    estaLines: first.estaLines,
    ukEtaLines: first.ukEtaLines,
    whatsappMessages: first.whatsappMessages,
    whatsappRequests: first.whatsappRequests.error ? [] : first.whatsappRequests.data || [],
    whatsappBookings: (first.stayRefs.data || []) as { id: string; reference: string }[],
    whatsappTemplates: approvedManualTemplates(),
    whatsappPreviewBlocked: isVercelPreview(),
    customerLogins: (first.loginRows.data || []) as CrmCustomerLogin[],
    customerActivity: (first.activityRows.data || []) as CrmCustomerActivity[],
    ficheBillingCompanies: (first.ficheCompanyRows.data || []) as CrmBillingCompany[],
    mb3m: {
      blocker: mb3mInvoiceBlocker(mb3mContext),
      piece: mb3mPiece,
      preparation: mb3mPreparationFromRow(mb3mDraft),
      amadeus,
    },
    accounting: second.accounting,
    importTasks: first.importTasks.error
      ? []
      : ((first.importTasks.data || []) as { id: string; kind: string; title: string }[]),
    checkins: first.checkins.error || !first.checkins.data ? [] : (first.checkins.data as StoredFlightCheckin[]),
  };
}

function gotItems(result: { data: unknown }) {
  return result.data;
}

async function loadPliantSpends(
  bookingCards: CrmBookingCard[],
  arrivals: CrmHotelArrival[],
  pliantCard: PliantCardDraft | null
) {
  try {
    const admin = createServiceClient();
    let spends: PliantSpendLine[] = await pliantSpendsForCards(
      admin,
      [
        ...bookingCards.map((card) => card.pliant_card_id),
        ...arrivals.map((row) => row.pliant_card_id || ""),
        pliantCard?.pliant_card_id || "",
      ],
      { limit: null }
    );
    try {
      spends = await withPliantSpendBookings(admin, spends);
    } catch {
      // Le lien vers la réservation manque ; les transactions restent lisibles.
    }
    return spends;
  } catch {
    return [] as PliantSpendLine[];
  }
}
