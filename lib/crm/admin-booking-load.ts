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
  console.time("[dossier] vague 1");
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
      .select(
        "id, confirmation_number, hotel_name, check_in, total_cost, currency, is_cancellable, cancellation_deadline, cancellation_policies, state, created_at"
      )
      .eq("crm_booking_id", id)
      .limit(20),
    billingCompanies: supabase
      .from("crm_billing_companies")
      .select(
        "id, company_name, sort_order, customer_id, funding, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country"
      )
      .eq("customer_id", b.billing_customer_id || b.customer_id)
      .order("sort_order"),
    ficheCompanyRows: supabase.from("crm_billing_companies").select("*").eq("customer_id", b.customer_id).order("sort_order"),
    revealPassports: staffAllows(staff, "passport_reveal"),
    showMargins: staffAllows(staff, "view_margins"),
    canEdit: staffAllows(staff, "edit_dossiers"),
    staffNames: loadStaffNames(createServiceClient(), [ownerRow.owner_staff_id, ownerRow.created_by_staff_id]),
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
  const bookingItems = await loadHotelContacts(id, rawItems, { live: false });
  console.timeEnd("[dossier] vague 1");
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
    confirmation_number?: string | null;
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
  const storedShare = (b as CrmBooking & { share_code?: string | null }).share_code;
  const shareUrl =
    b.visible_to_client && storedShare && isTripShareCode(storedShare) ? tripShareUrl(siteConfig.url, storedShare) : null;
  const panels = startDossierPanels({
    supabase,
    booking: b,
    customer,
    billingCustomer,
    bookingItems,
    travelers: bookingTravelers,
    billingCompanyRows,
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
      mine: (ownerRow.owner_staff_id ?? null) === staff.id,
      canTake: first.canEdit,
      meName: staff.full_name || "",
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
    arrivals: [],
    hotelRequests: [],
    hotelSignatory: hotelSignatoryName(staff.full_name),
    hotelMessages: [],
    hotelThreadMessages: [],
    openHotelItemId: input.openHotelItemId,
    openRelanceId: input.openRelanceId,
    openReplyId: input.openReplyId,
    billingCompanies: billingCompanyRows,
    revolutExpenses: [],
    expenseBilling: bookingItems
      .filter((item) => isLedgerExpenseKind(item.kind))
      .map((item) => ({
        id: item.id,
        title: visibleServiceCopy(item.title),
        billing_company_id: item.billing_company_id || null,
      })),
    attachedEmails: [],
    littleEmperors: leList[0] || null,
    leLinks: leList
      .filter((row) => row.confirmation_number)
      .map((row) => ({
        id: row.id,
        confirmation_number: row.confirmation_number as string,
        hotel_name: row.hotel_name,
      })),
    leStays: leList,
    ledger: null,
    accountLedger: null,
    bookingCards: [],
    pliantRecap: [],
    estaLines: [],
    ukEtaLines: [],
    whatsappMessages: [],
    whatsappRequests: [],
    whatsappBookings: [],
    whatsappTemplates: approvedManualTemplates(),
    whatsappPreviewBlocked: isVercelPreview(),
    customerLogins: [],
    customerActivity: [],
    ficheBillingCompanies: (first.ficheCompanyRows.data || []) as CrmBillingCompany[],
    mb3m: {
      blocker: null,
      piece: null,
      preparation: { state: null, message: null, resume: false },
      amadeus: [],
    },
    accounting: null,
    panels,
    importTasks: first.importTasks.error
      ? []
      : ((first.importTasks.data || []) as { id: string; kind: string; title: string }[]),
    checkins: first.checkins.error || !first.checkins.data ? [] : (first.checkins.data as StoredFlightCheckin[]),
  };
}

function gotItems(result: { data: unknown }) {
  return result.data;
}

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  console.time(label);
  try {
    return await run();
  } finally {
    console.timeEnd(label);
  }
}

function startDossierPanels(input: {
  supabase: SupabaseClient;
  booking: CrmBooking;
  customer: CrmCustomer | null;
  billingCustomer: CrmCustomer | null;
  bookingItems: CrmBookingItem[];
  travelers: CrmBookingTraveler[];
  billingCompanyRows: {
    id: string;
    company_name: string | null;
    sort_order: number;
    billing_email?: string | null;
    billing_address_line?: string | null;
    billing_postal_code?: string | null;
    billing_city?: string | null;
    billing_country?: string | null;
  }[];
}) {
  const { supabase, booking: b, customer, billingCustomer, bookingItems, travelers, billingCompanyRows } = input;
  const id = b.id;
  console.time("[dossier] vague 2");
  const settle = <T,>(label: string, run: () => Promise<T>): Promise<T | null> =>
    timed(label, run).then(
      (value) => value,
      (error: unknown) => {
        console.error("[dossier]", label, error instanceof Error ? error.message : error);
        return null;
      }
    );
  const emails = settle("[dossier] e-mails", async () => {
    const { data } = await supabase
      .from("crm_email_ingest")
      .select("id, subject, from_email, received_at, extract, warnings")
      .eq("status", "attached")
      .eq("created_booking_id", id)
      .order("received_at", { ascending: false, nullsFirst: false });
    return (data || []) as {
      id: string;
      subject: string | null;
      from_email: string | null;
      received_at: string | null;
      extract?: unknown;
      warnings?: { file?: string | null; message?: string | null }[] | null;
    }[];
  });
  const activity = settle("[dossier] activité", async () => {
    const [loginRows, activityRows] = await Promise.all([
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
        .limit(30),
    ]);
    return {
      logins: loginRows.error ? [] : ((loginRows.data || []) as CrmCustomerLogin[]),
      activity: activityRows.error ? [] : ((activityRows.data || []) as CrmCustomerActivity[]),
    };
  });
  const whatsapp = settle("[dossier] whatsapp", async () => {
    const [messages, requests, stayRefs] = await Promise.all([
      loadCustomerWhatsappMessages(supabase, b.customer_id, 50),
      supabase
        .from("crm_whatsapp_requests")
        .select("id, kind, body, booking_id, created_at")
        .eq("customer_id", b.customer_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("crm_bookings").select("id, reference").eq("customer_id", b.customer_id),
    ]);
    return {
      messages,
      requests: requests.error ? [] : requests.data || [],
      bookings: (stayRefs.data || []) as { id: string; reference: string }[],
    };
  });
  const esta = settle("[dossier] formalités", async () => {
    const [estaLines, ukEtaLines] = await Promise.all([
      loadEstaForBookingId(createServiceClient(), id).catch(() => []),
      readUkEtaLines(createServiceClient(), id).catch(() => []),
    ]);
    return { estaLines, ukEtaLines };
  });
  const pliant = settle("[dossier] pliant", async () => {
    const [cards, hotelDesk, registry] = await Promise.all([
      supabase
        .from("crm_booking_cards")
        .select(
          "id, booking_id, pliant_card_id, label, first_name, last_name, limit_cents, transaction_limit_cents, max_transaction_count, currency, valid_from, valid_to, last4, status, created_at"
        )
        .eq("booking_id", id)
        .order("created_at", { ascending: true }),
      loadArrivals(id),
      pliantCardForBooking(createServiceClient(), id).catch(() => null as PliantCardDraft | null),
    ]);
    const bookingCards = cards.error || !cards.data ? [] : (cards.data as CrmBookingCard[]);
    const spends = await loadPliantSpends(bookingCards, hotelDesk.arrivals, registry);
    const hotelNames: Record<string, string> = {};
    for (const item of bookingItems) {
      if (item.kind === "hotel") hotelNames[item.id] = hotelDisplayName(item);
    }
    return {
      bookingCards,
      pliantRecap: pliantCardRecaps(
        pliantBookingCards({ bookingCards, arrivals: hotelDesk.arrivals, hotelNames, registry }),
        spends
      ),
      arrivals: hotelDesk.arrivals,
      hotelRequests: hotelDesk.hotelRequests,
      hotelMessages: hotelDesk.hotelMessages,
      hotelThreadMessages: hotelDesk.hotelThreadMessages,
    };
  });
  const money = settle("[dossier] compta", async () => {
    const [ledgers, accountingInputs, gdsPieces, revolutExpenses] = await Promise.all([
      bookingLedgers(supabase, customer, billingCustomer, false),
      loadDossierAccountingInputs(createServiceClient(), id).catch((error: unknown) => {
        console.error("[reservation] comptabilité", error instanceof Error ? error.message : error);
        return EMPTY_ACCOUNTING;
      }),
      createServiceClient()
        .from("crm_mb3m_pieces")
        .select("piece_number, lines")
        .eq("booking_id", id)
        .eq("kind", "gds")
        .eq("realm", mb3mRealm()),
      loadRevolutExpenses(id),
    ]);
    const accounting = await buildTripAccountingView(createServiceClient(), b, bookingItems, accountingInputs).catch(
      (error: unknown) => {
        console.error("[reservation] comptabilité", error instanceof Error ? error.message : error);
        return null;
      }
    );
    const mb3mPiece = accountingInputs.openNumber ? { number: accountingInputs.openNumber } : null;
    const mb3mDraft = accountingInputs.pieces.find((row) => !row.printed_at && !(row.piece_number || "").trim()) || null;
    const amadeus = ((gdsPieces.data || []) as { piece_number: string | null; lines: unknown }[]).flatMap((row) => {
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
      travelers,
      payer: billingCustomer || customer,
      companies: billingCompanyRows,
      charges: accountingInputs.charges,
      coveredIds: accountingInputs.coveredIds,
      costs: accountingInputs.costs,
    });
    return {
      ledger: ledgers.ledger,
      accountLedger: ledgers.accountLedger,
      accounting,
      revolutExpenses,
      mb3m: {
        blocker: mb3mInvoiceBlocker(mb3mContext),
        piece: mb3mPiece,
        preparation: mb3mPreparationFromRow(mb3mDraft),
        amadeus,
      },
    };
  });
  void Promise.all([emails, activity, whatsapp, esta, pliant, money]).finally(() => {
    console.timeEnd("[dossier] vague 2");
  });
  return { emails, activity, whatsapp, esta, pliant, money };
}

export type DossierPanels = ReturnType<typeof startDossierPanels>;

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
