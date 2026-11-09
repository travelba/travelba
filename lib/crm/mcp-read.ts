import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { formatAgencyFeePercent, loadResolvedAgencyFees, type ResolvedAgencyFee } from "@/lib/crm/agency-fee-rate";
import { loadAgencyAccounts } from "@/lib/crm/agency-accounts";
import { attachSearchMatches, attachSearchTokens } from "@/lib/crm/attach-search";
import { adminBadges } from "@/lib/crm/admin-badges";
import {
  joinOrFilters,
  orSearchFilter,
  phoneSearchFilter,
  searchPattern,
  sortBookingsByProximity,
  type BookingStateFilter,
  type FilterableQuery,
} from "@/lib/crm/admin-list";
import { findAttachBookingIds } from "@/lib/crm/attach-search-db";
import { adminTodoLines } from "@/lib/crm/admin-todo";
import { clientCreditLines } from "@/lib/crm/unmatch-credit";
import { dossierFlightStamp } from "@/lib/crm/airport-time";
import { flightCities, flightIata, hotelDisplayName } from "@/lib/crm/carnet";
import { checkinMcpLine, type FlightCheckinView } from "@/lib/crm/online-checkin";
import { loadCheckinContext, viewsFromContext } from "@/lib/crm/online-checkin-db";
import { loadLedgerCountedStayAmounts } from "@/lib/crm/displayed-stay";
import {
  cancellationStatut,
  extractCancellationVerdict,
  leCancellationVerdict,
  loadStayAnchors,
  parseStoredExtract,
} from "@/lib/crm/cancellation-standing";
import { McpReadError } from "@/lib/crm/mcp-passport";
import { loadOpenEstaNotices } from "@/lib/crm/esta-run";
import { clientLedgerAdminHref, loadClientLedger } from "@/lib/crm/client-ledger";
import { ledgerTravelerLabel } from "@/lib/crm/ledger-travelers";
import {
  countDossiersByCustomer,
  CUSTOMER_LIST_SELECT,
  CUSTOMER_NAME_SELECT,
  type CustomerListRow,
  type CustomerNameRow,
} from "@/lib/crm/customer-search";
import { loadDashboardMails } from "@/lib/crm/dashboard-mails";
import { loadDossierPeople, type DossierPeople } from "@/lib/crm/dossier-responsables";
import { refreshStaleHotelThreads } from "@/lib/crm/hotel-desk-run";
import { formatDateTimeFr } from "@/lib/crm/dates";
import { pieceDigits } from "@/lib/crm/stripe-payer";
import { loadStripeSuggestHints } from "@/lib/crm/stripe-suggest-load";
import { scoreStripeMatches, STRIPE_MATCH_SELECT, type StripeMatchCustomer } from "@/lib/crm/stripe-match";
import { matchStripeReasonLabel } from "@/lib/crm/stripe-labels";
import { stripeShownCandidate } from "@/lib/crm/stripe-inbox";
import { leListMadeAt, loadLeConfirmationMails } from "@/lib/crm/le-confirmation-mail";
import { compareLeMadeAt, leMadeDayLabel } from "@/lib/crm/le-made-at";
import { formatDateFr, formatMoney, isoDateInDays, todayIsoDate } from "@/lib/crm/money";
import { revolutDebitLine, revolutInboxCopy, revolutInboxVisible } from "@/lib/crm/revolut-inbox";
import { revolutRowCollectable } from "@/lib/crm/revolut-classify";
import { splitPendingStripePayouts } from "@/lib/crm/stripe-payout-sync";
import { serviceDeskLines, type ServiceDeskItem } from "@/lib/crm/service-desk";
import { MCP_LE_LIST_COLUMNS } from "@/lib/crm/mcp-columns";
import { queryWithOptionalColumn } from "@/lib/crm/optional-column";
import { dossierFace, dossierFaceLabel } from "@/lib/crm/dossier-status";
import { staffLedgerCaption, staffStayLabel } from "@/lib/crm/staff-stay";
import { stayToday } from "@/lib/crm/stay-moment";
import { buildTripAccountingView, loadDossierAccountingInputs } from "@/lib/crm/trip-accounting-view";
import { costSuggestionSummary, dossierClientLabel, TRIP_ACCOUNTING_LABELS, type OutgoingLine, type TripCost } from "@/lib/crm/trip-costs";
import { pliantAuthorizationAt } from "@/lib/crm/pliant-tx";
import { loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import { reviewIdentityPieces } from "@/lib/crm/trip-documents";
import {
  DOC_TYPE_LABELS,
  EMAIL_INBOX_QUEUE_STATUSES,
  customerFullName,
  isActiveItem,
  isLedgerExpenseKind,
  type CrmBooking,
  type CrmBookingItem,
  type CrmCustomer,
  type CrmEmailIngest,
  type CrmLeBooking,
  type CrmRevolutTransaction,
  type CrmStripeTransaction,
  type CrmTravelDocument,
  type TravelDocType,
} from "@/lib/crm/types";
import { readExpensePricing } from "@/lib/crm/expense-pricing";
import { pliantExpenseOrigin } from "@/lib/crm/pliant-expense";
import { expenseAwaitsValidation } from "@/lib/crm/expense-validation";
import { CLIENT_VISA_STEPS, clientVisaStepCopy, type ClientVisaStep } from "@/lib/crm/visa-flow";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import { reasonLabel, type DeskTask } from "@/lib/crm/visa-desk";
import { loadAccueilTodoCounts } from "@/lib/crm/admin-todo-load";
import { createServiceClient } from "@/lib/supabase/admin";
import { mcpPageMeta, mcpSlice, mcpWindow } from "@/lib/crm/mcp-page";

const LIST_LIMIT = 20;
const INBOX_LIMIT = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICE_KINDS = ["chauffeur", "greeter", "checkin"] as const;

const BOOKING_COLUMNS =
  "id, reference, title, destination, status, start_date, end_date, created_at, currency, total_amount, agency_commission, fee_mode, visible_to_client, archived_at, customer_id, client_settles_stay, include_in_ledger, billing_company_id, payer_kind";

type BookingRow = Pick<
  CrmBooking,
  | "id"
  | "reference"
  | "title"
  | "destination"
  | "status"
  | "start_date"
  | "end_date"
  | "currency"
  | "total_amount"
  | "visible_to_client"
  | "customer_id"
> & {
  agency_commission?: boolean | null;
  fee_mode?: string | null;
  archived_at?: string | null;
  client_settles_stay?: boolean | null;
  include_in_ledger?: boolean | null;
  created_at?: string | null;
  billing_company_id?: string | null;
  payer_kind?: "company" | "personal" | null;
};

function db() {
  // Node 20 n’a pas de WebSocket global ; le client Supabase en a besoin pour s’ouvrir.
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function logRead(scope: string, error: { code?: string; message?: string }) {
  console.error("[mcp]", scope, error.code ?? "?");
}

function customerLine(row: CustomerListRow | CustomerNameRow) {
  return {
    id: row.id,
    nom: customerFullName(row),
    societe: "company_name" in row ? row.company_name || null : null,
    email: "email" in row ? row.email || null : null,
    telephone: "phone" in row ? row.phone || null : null,
    naissance: "birth_date" in row ? row.birth_date || null : null,
    lien: `/admin/clients/${row.id}`,
  };
}

async function withDossierCounts(admin: SupabaseClient, rows: CustomerListRow[]) {
  if (!rows.length) return rows.map((row) => ({ ...customerLine(row), dossiers: 0 }));
  const { data, error } = await admin
    .from("crm_bookings")
    .select("customer_id")
    .in(
      "customer_id",
      rows.map((row) => row.id)
    );
  if (error) logRead("dossiers", error);
  const counts = countDossiersByCustomer((data || []) as { customer_id: string | null }[]);
  return rows.map((row) => ({ ...customerLine(row), dossiers: counts.get(row.id) || 0 }));
}

/** Société facturée, à côté du contact. Particulier si le séjour n’est pas à la société. */
export function dossierPayerLine(
  row: { payer_kind?: "company" | "personal" | null; billing_company_id?: string | null },
  companyName: string | null | undefined
) {
  const company = row.payer_kind === "company" || Boolean(row.billing_company_id);
  return {
    societe: company ? companyName || null : null,
    paye_par: company ? ("société" as const) : ("particulier" as const),
  };
}

function bookingLine(
  row: BookingRow,
  names: Map<string, string>,
  amounts: Map<string, number>,
  companies: Map<string, string | null>
) {
  const amount = amounts.get(row.id);
  return {
    id: row.id,
    reference: row.reference,
    titre: row.title,
    destination: row.destination,
    dates: [row.start_date, row.end_date].filter(Boolean).join(" → ") || null,
    etat: staffStayLabel(row),
    statut: dossierFace(row),
    statut_libelle: dossierFaceLabel(row),
    statut_reel: dossierFace(row),
    archivee: Boolean(row.archived_at),
    client: names.get(row.customer_id) || null,
    ...dossierPayerLine(row, row.billing_company_id ? companies.get(row.billing_company_id) : null),
    montant: amount == null ? null : formatMoney(amount, row.currency || "EUR"),
    grand_livre: staffLedgerCaption(row),
    lien: `/admin/reservations/${row.id}`,
  };
}

async function companyNames(admin: SupabaseClient, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string | null>();
  const { data, error } = await admin.from("crm_billing_companies").select("id, company_name").in("id", unique);
  if (error) {
    logRead("societes", error);
    throw new McpReadError("Lecture de la société impossible.");
  }
  return new Map(((data || []) as { id: string; company_name: string | null }[]).map((row) => [row.id, row.company_name]));
}

async function dossierAmounts(admin: SupabaseClient, rows: BookingRow[]) {
  try {
    return await loadLedgerCountedStayAmounts(admin, rows);
  } catch (err) {
    logRead("montant", err as { code?: string; message?: string });
    throw new McpReadError("Lecture du montant impossible.");
  }
}

async function bookingCards(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, confirmation_ref, start_at, end_at, amount, details, lifecycle, visible_to_client, sort_order")
    .eq("booking_id", bookingId)
    .order("sort_order");
  if (error) {
    logRead("cartes", error);
    throw new McpReadError("Lecture des cartes impossible.");
  }
  return ((data || []) as CrmBookingItem[]).filter((item) => isActiveItem(item));
}

function pliantStatusLabel(status: string | null | undefined) {
  if (status === "locked") return "bloquée";
  if (status === "terminated") return "supprimée";
  return "active";
}

async function bookingPliantCards(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from("crm_booking_cards")
    .select("id, label, limit_cents, currency, status, last4")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) {
    logRead("cartes pliant", error);
    throw new McpReadError("Lecture des cartes Pliant impossible.");
  }
  return ((data || []) as { id: string; label: string | null; limit_cents: number | null; currency: string | null; status: string | null; last4: string | null }[]).map(
    (row) => ({
      carte_id: row.id,
      nom: row.label || "Carte",
      plafond: row.limit_cents == null ? null : row.limit_cents / 100,
      devise: row.currency || "EUR",
      quatre_derniers: row.last4 && /^\d{4}$/.test(row.last4) ? row.last4 : null,
      statut: pliantStatusLabel(row.status),
    })
  );
}

async function bookingTravelers(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from("crm_booking_travelers")
    .select("id, first_name, last_name")
    .eq("booking_id", bookingId);
  if (error) {
    logRead("voyageurs", error);
    throw new McpReadError("Lecture des voyageurs impossible.");
  }
  return (data || []) as { id: string; first_name: string | null; last_name: string | null }[];
}

type ServiceBookingRow = { id: string; reference: string; status: string; customer_id: string };

async function openServiceLines(admin: SupabaseClient, serviceBookings: ServiceBookingRow[]) {
  const serviceIds = serviceBookings.map((row) => row.id);
  const { data: serviceRows } = serviceIds.length
    ? await admin
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, start_at, end_at, details")
        .in("booking_id", serviceIds)
        .in("kind", [...SERVICE_KINDS])
    : { data: [] as ServiceDeskItem[] };
  const serviceItems = (serviceRows || []) as ServiceDeskItem[];
  const withServices = [...new Set(serviceItems.map((row) => row.booking_id))];
  const { data: flights } = withServices.length
    ? await admin
        .from("crm_booking_items")
        .select("id, booking_id, kind, title, start_at, end_at, details")
        .in("booking_id", withServices)
        .eq("kind", "flight")
    : { data: [] as ServiceDeskItem[] };
  const names = await customerNames(
    admin,
    serviceBookings.filter((row) => withServices.includes(row.id)).map((row) => row.customer_id)
  );
  return serviceDeskLines({
    now: new Date(),
    names: Object.fromEntries(names),
    bookings: serviceBookings.filter((row) => withServices.includes(row.id)),
    items: [...serviceItems, ...((flights || []) as ServiceDeskItem[])],
  }).map((line) => ({
    dossier_id: line.bookingId,
    carte_id: line.itemId,
    reference: line.reference,
    client: line.holderName,
    service: line.kindLabel,
    detail: line.detail,
    plus_tard: line.later,
    lien: `/admin/reservations/${line.bookingId}`,
  }));
}

async function customerNames(admin: SupabaseClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const { data, error } = await admin.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", unique);
  if (error) logRead("noms", error);
  return new Map(((data || []) as CustomerNameRow[]).map((row) => [row.id, customerFullName(row)]));
}

function pieceLine(doc: CrmTravelDocument, names?: Map<string, string>) {
  const type = DOC_TYPE_LABELS[doc.doc_type as TravelDocType] || doc.doc_type;
  const who = [doc.first_name, doc.last_name].filter(Boolean).join(" ").trim();
  return {
    type,
    expire_le: doc.expires_on ? formatDateFr(doc.expires_on) : null,
    nom: who || (names?.get(doc.customer_id) ?? null),
    lien: `/admin/clients/${doc.customer_id}`,
  };
}

export async function readTableauDeBord() {
  const admin = db();
  const today = todayIsoDate();
  const [badges, balances, comptes, bookingCount, departSoon, whatsappOpen, tripTodo] = await Promise.all([
    adminBadges(),
    admin.from("crm_customer_balances").select("balance, currency"),
    loadAgencyAccounts(),
    admin.from("crm_bookings").select("id", { count: "exact", head: true }).is("archived_at", null),
    admin
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .gte("start_date", today)
      .lte("start_date", isoDateInDays(7))
      .neq("status", "cancelled")
      .is("archived_at", null),
    admin
      .from("crm_whatsapp_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    loadAccueilTodoCounts(admin, stayToday()),
  ]);
  const remaining = ((balances.data || []) as { balance: number | string }[]).reduce(
    (sum, row) => sum + Math.max(0, -Number(row.balance) || 0),
    0
  );
  let courriers: Awaited<ReturnType<typeof loadDashboardMails>> = [];
  try {
    await refreshStaleHotelThreads(admin, { limit: 4, budgetMs: 1500 });
    courriers = await loadDashboardMails(admin);
  } catch {
    courriers = [];
  }
  return {
    a_faire: adminTodoLines({
      whatsapp: whatsappOpen.error ? 0 : whatsappOpen.count ?? 0,
      unread: badges.whatsapp,
      hotels: badges.hotels,
      paymentLinks: tripTodo.paymentLinks,
      visas: tripTodo.visas,
      checkins: tripTodo.checkins,
    }),
    encours_a_encaisser: formatMoney(remaining),
    comptes: comptes.map((account) => ({
      nom: account.label,
      lien: account.href,
      poches: account.pockets.map((pocket) => ({
        nom: pocket.name,
        solde: pocket.amount == null ? null : formatMoney(pocket.amount, pocket.currency),
        en_attente:
          pocket.pending == null || pocket.pending === 0 ? null : formatMoney(pocket.pending, pocket.currency),
      })),
    })),
    departs_sous_7_jours: departSoon.count ?? 0,
    dossiers_actifs: bookingCount.count ?? 0,
    courriers_hotel: courriers.map((mail) => ({
      hotel: mail.title,
      reference: mail.reference,
      demande: mail.mark,
      statut: mail.replyLabel,
      activite: formatDateTimeFr(mail.receivedAt),
      par: mail.lastWriter,
      extrait: mail.excerpt || null,
      lien: mail.href,
    })),
  };
}

/** Débits Séjour encore postés sur un dossier Hors agence : ils ne comptent pas dans l’encours. */
async function offAgencyStayAmounts(admin: SupabaseClient, customerId: string) {
  const totals = new Map<string, number>();
  const { data: stays, error } = await admin
    .from("crm_bookings")
    .select("id")
    .eq("client_settles_stay", true)
    .or(`customer_id.eq.${customerId},billing_customer_id.eq.${customerId}`);
  if (error || !stays?.length) return totals;
  const ids = (stays as { id: string }[]).map((row) => row.id);
  const { data: txs } = await admin
    .from("crm_transactions")
    .select("amount, currency")
    .in("booking_id", ids)
    .eq("direction", "debit")
    .eq("kind", "booking")
    .is("external_id", null)
    .eq("status", "posted");
  for (const row of (txs || []) as { amount?: number | string | null; currency?: string | null }[]) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const currency = (row.currency || "EUR").toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return totals;
}

function customerHay(row: CustomerListRow) {
  return [row.first_name, row.last_name, row.usage_name, row.company_name, row.email, row.phone].filter(Boolean).join(" ");
}

async function searchCustomers(admin: SupabaseClient, q: string, limit = LIST_LIMIT, page = 1) {
  const window = mcpWindow({ page, limite: limit }, LIST_LIMIT);
  const tokens = attachSearchTokens(q);
  const anchor = tokens[tokens.length - 1] || "";
  const pattern = searchPattern(anchor || q);
  let query = admin.from("crm_customers").select(CUSTOMER_LIST_SELECT).order("last_name").order("id");
  if (pattern || phoneSearchFilter(q)) {
    query = query.or(
      joinOrFilters(
        pattern
          ? orSearchFilter(pattern, ["first_name", "last_name", "usage_name", "company_name", "email", "phone"])
          : "",
        phoneSearchFilter(q)
      )
    );
  }
  const { data, error } = await query.limit(80);
  if (error) {
    logRead("clients", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as CustomerListRow[];
  const matched = tokens.length > 1 ? rows.filter((row) => attachSearchMatches(customerHay(row), q)) : rows;
  return mcpPageMeta(matched, window);
}

export async function readChercherClients(input: { q?: string; echeance?: boolean; page?: number; limite?: number }) {
  const admin = db();
  if (input.echeance) {
    const { data, error } = await admin
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on, first_name, last_name, number, companion_id, booking_id, traveler_id")
      .not("expires_on", "is", null)
      .gte("expires_on", isoDateInDays(0))
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on");
    if (error) {
      logRead("pieces", error);
      throw new Error("Lecture impossible.");
    }
    const docs = reviewIdentityPieces((data || []) as CrmTravelDocument[]);
    const window = mcpWindow(input, 40);
    const page = mcpSlice(docs, window);
    const names = await customerNames(admin, page.rows.map((doc) => doc.customer_id));
    return {
      pieces: page.rows.map((doc) => pieceLine(doc, names)),
      page: page.page,
      limite: page.limite,
      suite: page.suite,
      page_suivante: page.page_suivante,
    };
  }
  const q = (input.q || "").trim();
  const window = mcpWindow(input, LIST_LIMIT);
  const listed = await searchCustomers(admin, q, window.limite, window.page);
  const clients = await withDossierCounts(admin, listed.rows);
  if (!q) {
    const { count, error } = await admin.from("crm_customers").select("id", { count: "exact", head: true });
    if (error) logRead("clients", error);
    return {
      message: "Clients, par nom. q affine. page continue la liste.",
      total: count ?? clients.length,
      clients,
      page: listed.page,
      limite: listed.limite,
      suite: listed.suite,
      page_suivante: listed.page_suivante,
    };
  }
  return {
    clients,
    page: listed.page,
    limite: listed.limite,
    suite: listed.suite,
    page_suivante: listed.page_suivante,
  };
}

async function oneCustomer(admin: SupabaseClient, input: { id?: string; q?: string }) {
  const id = (input.id || "").trim();
  if (id) {
    if (!UUID.test(id)) return { kind: "invalid" as const };
    const { data, error } = await admin.from("crm_customers").select(CUSTOMER_LIST_SELECT).eq("id", id).maybeSingle();
    if (error) {
      logRead("fiche", error);
      throw new Error("Lecture impossible.");
    }
    if (!data) return { kind: "none" as const };
    return { kind: "one" as const, customer: data as CustomerListRow };
  }
  const q = (input.q || "").trim();
  if (!q) return { kind: "missing" as const };
  const rows = (await searchCustomers(admin, q, 8)).rows;
  if (!rows.length) return { kind: "none" as const };
  if (rows.length > 1) return { kind: "many" as const, customers: rows };
  return { kind: "one" as const, customer: rows[0] };
}

export async function readFicheClient(input: { id?: string; q?: string }, admin = db()) {
  const found = await oneCustomer(admin, input);
  if (found.kind === "missing" || found.kind === "invalid") {
    return { message: "Indiquez l’identifiant ou le nom du client." };
  }
  if (found.kind === "none") return { introuvable: true };
  if (found.kind === "many") return { choix: await withDossierCounts(admin, found.customers) };
  const customer = found.customer;
  const offAgency = await offAgencyStayAmounts(admin, customer.id);
  const [{ data: balances }, { data: docs }] = await Promise.all([
    admin.from("crm_customer_balances").select("currency, balance").eq("customer_id", customer.id),
    admin
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on, first_name, last_name, number, companion_id, booking_id, traveler_id")
      .eq("customer_id", customer.id)
      .not("expires_on", "is", null)
      .gte("expires_on", isoDateInDays(0))
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on")
      .limit(20),
  ]);
  const wallets = ((balances || []) as { currency: string; balance: number | string }[]).map((row) => {
    const currency = row.currency || "EUR";
    const value = Number(row.balance) + (offAgency.get(currency.toUpperCase()) || 0);
    return {
      devise: currency,
      solde: formatMoney(value, currency),
      solde_valeur: value,
      sens: value > 0 ? "avoir" : value < 0 ? "reste à payer" : "soldé",
    };
  });
  const pieces = reviewIdentityPieces((docs || []) as CrmTravelDocument[]);
  return {
    ...customerLine(customer),
    en_veille: customer.on_hold === true,
    encours: wallets,
    pieces_a_echeance: pieces.map((doc) => pieceLine(doc)),
  };
}

function applyBookingFilters(query: FilterableQuery, input: { etat: BookingStateFilter | null; today: string }) {
  let next = query;
  if (input.etat === "archive") next = next.not("archived_at", "is", null);
  else next = next.is("archived_at", null);
  if (input.etat === "preparation") {
    next = next.eq("visible_to_client", false).neq("status", "cancelled");
  }
  if (input.etat === "montre") {
    next = next.eq("visible_to_client", true).neq("status", "cancelled");
  }
  if (input.etat === "annule") next = next.eq("status", "cancelled");
  if (input.etat === "a-venir") next = next.gte("start_date", input.today).neq("status", "cancelled");
  return next;
}

export async function readChercherDossiers(
  input: { q?: string; etat?: BookingStateFilter | null; page?: number; limite?: number },
  admin = db()
) {
  const q = (input.q || "").trim();
  const etat = input.etat ?? (q ? null : "a-venir");
  const window = mcpWindow(input, LIST_LIMIT);
  const today = todayIsoDate();
  const pattern = searchPattern(q);
  const rankedIds =
    pattern && typeof (admin as { rpc?: unknown }).rpc === "function" ? await findAttachBookingIds(admin, q) : null;
  if (rankedIds && !rankedIds.length) {
    return { etat: etat || "recherche", dossiers: [], page: window.page, limite: window.limite, suite: false, page_suivante: null };
  }
  let matchedCustomerIds: string[] = [];
  if (pattern && !rankedIds) {
    const { data } = await admin
      .from("crm_customers")
      .select("id")
      .or(joinOrFilters(orSearchFilter(pattern, ["first_name", "last_name", "company_name"]), phoneSearchFilter(q)))
      .limit(50);
    matchedCustomerIds = ((data || []) as { id: string }[]).map((row) => row.id);
  }
  let query = admin.from("crm_bookings").select(BOOKING_COLUMNS) as unknown as FilterableQuery;
  query = applyBookingFilters(query, { etat, today });
  const rankedPage = rankedIds?.length ? rankedIds.slice(window.from, window.from + window.limite + 1) : null;
  if (rankedPage && !rankedPage.length) {
    return { etat: etat || "recherche", dossiers: [], page: window.page, limite: window.limite, suite: false, page_suivante: null };
  }
  if (rankedPage) query = query.in("id", rankedPage.slice(0, window.limite));
  else if (pattern) {
    query = query.or(orSearchFilter(pattern, ["reference", "title", "destination"], "customer_id", matchedCustomerIds));
  }
  const upcomingOnly = etat === "a-venir";
  const ordered = (
    query as unknown as {
      order: (column: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
        limit: (n: number) => Promise<{ data: BookingRow[] | null; error: { code?: string } | null }>;
        range: (from: number, to: number) => Promise<{ data: BookingRow[] | null; error: { code?: string } | null }>;
      };
    }
  ).order("start_date", { ascending: upcomingOnly || !q, nullsFirst: false });
  const { data, error } = rankedPage
    ? await ordered.limit(window.limite + 1)
    : window.from === 0
      ? await ordered.limit(window.limite + 1)
      : await ordered.range(window.from, window.from + window.limite);
  if (error) {
    logRead("dossiers", error);
    throw new Error("Lecture impossible.");
  }
  const found = data || [];
  const orderedRows = rankedIds?.length
    ? found.slice().sort((a, b) => {
        const left = rankedIds.indexOf(a.id);
        const right = rankedIds.indexOf(b.id);
        return (left < 0 ? rankedIds.length : left) - (right < 0 ? rankedIds.length : right);
      })
    : sortBookingsByProximity(found, stayToday());
  const paged = rankedPage
    ? mcpPageMeta(orderedRows.slice(0, window.limite + 1), window)
    : mcpPageMeta(orderedRows, window);
  const rows = paged.rows;
  const [names, amounts, companies] = await Promise.all([
    customerNames(admin, rows.map((row) => row.customer_id)),
    dossierAmounts(admin, rows),
    companyNames(admin, rows.map((row) => row.billing_company_id)),
  ]);
  const rankedSuite = Boolean(rankedPage && rankedPage.length > window.limite);
  return {
    etat: etat || "recherche",
    dossiers: rows.map((row) => bookingLine(row, names, amounts, companies)),
    page: window.page,
    limite: window.limite,
    suite: rankedPage ? rankedSuite : paged.suite,
    page_suivante: (rankedPage ? rankedSuite : paged.suite) ? window.page + 1 : null,
  };
}

function cardLine(
  item: Pick<CrmBookingItem, "id" | "kind" | "title" | "supplier" | "confirmation_ref" | "start_at" | "end_at" | "details" | "visible_to_client">,
  checkin?: FlightCheckinView | null
) {
  const full = item as CrmBookingItem;
  const city = typeof item.details?.city === "string" ? item.details.city : null;
  if (item.kind === "flight") {
    const from = typeof item.details?.from === "string" ? item.details.from : null;
    const to = typeof item.details?.to === "string" ? item.details.to : null;
    const line = checkin ? checkinMcpLine(checkin) : null;
    return {
      carte_id: item.id,
      kind: "vol",
      titre: flightCities(full) || item.title,
      aeroports: flightIata(full) || null,
      debut: dossierFlightStamp(item.start_at, from, item.details?.departure_timezone),
      fin: dossierFlightStamp(item.end_at, to, item.details?.arrival_timezone),
      reference: item.confirmation_ref,
      montre: item.visible_to_client,
      enregistrement: line
        ? {
            statut: line.statut,
            libelle: line.libelle,
            ouverture: line.ouverture,
            ouverture_libelle: line.ouverture_libelle,
            heures_avant: line.heures_avant,
            par: line.par,
            alerte: line.alerte,
            fait: line.fait,
          }
        : null,
    };
  }
  if (item.kind === "accueil_vip") {
    return {
      carte_id: item.id,
      kind: "accueil VIP",
      titre: item.title,
      fournisseur: item.supplier,
      debut: item.start_at,
      fin: item.end_at,
      reference: item.confirmation_ref,
      montre: item.visible_to_client,
    };
  }
  if (item.kind === "hotel") {
    return {
      carte_id: item.id,
      kind: "hôtel",
      titre: hotelDisplayName(full),
      ville: city,
      debut: item.start_at,
      fin: item.end_at,
      reference: item.confirmation_ref,
      montre: item.visible_to_client,
    };
  }
  if (isLedgerExpenseKind(item.kind)) {
    const amount = full.amount == null ? null : Number(full.amount);
    const pricing = readExpensePricing(item.details, amount);
    const origin = pliantExpenseOrigin(item.details, amount);
    return {
      carte_id: item.id,
      kind: "expense",
      titre: item.title,
      date: item.start_at ? String(item.start_at).slice(0, 10) : null,
      quantite: pricing.quantity,
      prix_unitaire: pricing.unitPrice,
      montant: pricing.amount,
      a_valider: expenseAwaitsValidation(item),
      pliant: origin
        ? { commercant: origin.merchant, date: origin.date, montant_pliant: origin.amount, montant_modifie: origin.edited }
        : null,
      modifier: "mettre_a_jour_dossier.depense",
    };
  }
  return {
    carte_id: item.id,
    kind: item.kind,
    titre: item.title,
    fournisseur: item.supplier,
    debut: item.start_at,
    fin: item.end_at,
    reference: item.confirmation_ref,
    montre: item.visible_to_client,
  };
}

function corridorName(country: string) {
  if (country === "IL" || country === "US" || country === "GB") return VISA_OFFICIAL[country as VisaCorridor].countryName;
  return country;
}

function visaStepLabel(step: string | null) {
  if (step && (CLIENT_VISA_STEPS as readonly string[]).includes(step)) return clientVisaStepCopy(step as ClientVisaStep);
  return step;
}

export async function readFicheDossier(input: { id?: string; reference?: string }, admin = db()) {
  const id = (input.id || "").trim();
  const reference = (input.reference || "").trim();
  if (!id && !reference) return { message: "Indiquez l’identifiant ou la référence du dossier." };
  let query = admin.from("crm_bookings").select(BOOKING_COLUMNS);
  if (id) {
    if (!UUID.test(id)) return { message: "Identifiant inconnu." };
    query = query.eq("id", id);
  } else {
    query = query.eq("reference", reference);
  }
  const { data, error } = await query.limit(2);
  if (error) {
    logRead("dossier", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as BookingRow[];
  if (!rows.length) return { introuvable: true };
  if (rows.length > 1) {
    const [names, companies] = await Promise.all([
      customerNames(admin, rows.map((row) => row.customer_id)),
      companyNames(admin, rows.map((row) => row.billing_company_id)),
    ]);
    return { choix: rows.map((row) => bookingLine(row, names, new Map(), companies)) };
  }
  const booking = rows[0];
  const [cards, pliantCards, travelers, visas, tasks, names, amounts, companies, checkin] = await Promise.all([
    bookingCards(admin, booking.id),
    bookingPliantCards(admin, booking.id),
    bookingTravelers(admin, booking.id),
    admin.from("crm_visa_requests").select("country, status, step").eq("booking_id", booking.id),
    admin.from("crm_visa_tasks").select("holder_name, reasons, done_at").eq("booking_id", booking.id).is("done_at", null),
    customerNames(admin, [booking.customer_id]),
    dossierAmounts(admin, [booking]),
    companyNames(admin, [booking.billing_company_id]),
    loadCheckinContext(admin, booking.id),
  ]);
  const checkinByItem = new Map(viewsFromContext(checkin).map((line) => [line.itemId, line]));
  if (visas.error) logRead("visas", visas.error);
  if (tasks.error) logRead("taches", tasks.error);
  let commission: ResolvedAgencyFee = { rate: 0.1, source: "defaut" };
  try {
    const fees = await loadResolvedAgencyFees(admin, [booking]);
    commission = fees.get(booking.id) || commission;
  } catch (err) {
    logRead("commission", err as { code?: string; message?: string });
  }
  let people: DossierPeople = { createdBy: null, owner: null, intervenants: [] };
  try {
    people = await loadDossierPeople(admin, booking);
  } catch (err) {
    logRead("responsables", err as { code?: string; message?: string });
  }
  return {
    ...bookingLine(booking, names, amounts, companies),
    en_charge: people.owner?.name ?? null,
    cree_par: people.createdBy?.name ?? null,
    intervenants: people.intervenants.map((person) => person.name),
    commission_agence: formatAgencyFeePercent(commission.rate),
    commission_source: commission.source,
    commission_appliquee: booking.agency_commission === true,
    voyageurs: travelers.map((row) => ({
      voyageur_id: row.id,
      nom: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
    })),
    cartes: cards.map((item) => cardLine(item, checkinByItem.get(item.id) || null)),
    cartes_pliant: pliantCards,
    formalites: [
      ...((visas.data || []) as { country: string; status: string | null; step: string | null }[])
        .filter((row) => row.status === "refuse" || (row.step !== "piece" && row.status !== "piece"))
        .map((row) => ({
          pays: corridorName(row.country),
          etape: visaStepLabel(row.step),
          statut: row.status,
        })),
      ...((tasks.data || []) as { holder_name: string; reasons: DeskTask["reasons"] }[]).map((row) => ({
        tache: reasonLabel(row.reasons || []),
        voyageur: row.holder_name,
      })),
    ],
  };
}

export async function readFormalites(
  input: { reference?: string; dossier_id?: string; page?: number; limite?: number } = {},
  admin = db()
) {
  const today = todayIsoDate();
  const dossierId = (input.dossier_id || "").trim();
  const reference = (input.reference || "").trim();
  let bookingId = "";
  if (dossierId || reference) {
    let query = admin.from("crm_bookings").select("id, reference");
    query = dossierId ? query.eq("id", dossierId) : query.eq("reference", reference);
    const { data, error } = await query.limit(2);
    if (error) logRead("formalites", error);
    const rows = (data || []) as { id: string }[];
    if (rows.length !== 1) {
      return { jour: today, introuvable: true, taches: [], demandes: [], esta: [] };
    }
    bookingId = rows[0].id;
  }
  const window = mcpWindow(input, 40);
  const take = window.from + window.limite + 1;
  const taskQuery = admin
    .from("crm_visa_tasks")
    .select("booking_id, holder_name, reference, reasons, done_at")
    .is("done_at", null);
  const visaQuery = admin.from("crm_visa_requests").select("booking_id, country, status, step");
  const [tasks, visas, esta] = await Promise.all([
    (bookingId ? taskQuery.eq("booking_id", bookingId) : taskQuery).order("created_at", { ascending: false }).limit(take),
    (bookingId ? visaQuery.eq("booking_id", bookingId) : visaQuery).order("created_at", { ascending: false }).limit(take),
    loadOpenEstaNotices(admin, bookingId || undefined).catch(() => []),
  ]);
  if (tasks.error) logRead("formalites", tasks.error);
  if (visas.error) logRead("visas", visas.error);
  const openVisas = ((visas.data || []) as { booking_id: string; country: string; status: string | null; step: string | null }[]).filter(
    (row) => row.status === "refuse" || (row.step !== "piece" && row.status !== "piece")
  );
  const taskRows = (tasks.data || []) as { booking_id: string; holder_name: string; reference: string; reasons: DeskTask["reasons"] }[];
  const taskPage = mcpSlice(taskRows, window);
  const visaPage = mcpSlice(openVisas, window);
  const suite = taskPage.suite || visaPage.suite || taskRows.length >= take || (visas.data || []).length >= take;
  return {
    jour: today,
    taches: taskPage.rows.map((row) => ({
      reference: row.reference,
      voyageur: row.holder_name,
      motif: reasonLabel(row.reasons || []),
      lien: `/admin/reservations/${row.booking_id}`,
    })),
    demandes: visaPage.rows.map((row) => ({
      pays: corridorName(row.country),
      etape: visaStepLabel(row.step),
      statut: row.status,
      lien: `/admin/reservations/${row.booking_id}`,
    })),
    esta: esta.map((row) => ({ label: row.label, lien: row.href })),
    page: window.page,
    limite: window.limite,
    suite,
    page_suivante: suite ? window.page + 1 : null,
  };
}

export async function readServicesAConfirmer(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  const window = mcpWindow(input, LIST_LIMIT);
  const { data } = await admin
    .from("crm_bookings")
    .select("id, reference, status, customer_id")
    .neq("status", "cancelled")
    .is("archived_at", null)
    .or(`end_date.is.null,end_date.gte.${isoDateInDays(-1)}`)
    .order("start_date", { ascending: true, nullsFirst: false })
    .limit(window.from + window.limite + 1);
  const stays = mcpSlice((data || []) as ServiceBookingRow[], window);
  return {
    services: await openServiceLines(admin, stays.rows),
    page: stays.page,
    limite: stays.limite,
    suite: stays.suite,
    page_suivante: stays.page_suivante,
  };
}

export async function readGrandLivre(input: { id?: string; q?: string; page?: number; limite?: number }, admin = db()) {
  const found = await oneCustomer(admin, input);
  if (found.kind === "missing" || found.kind === "invalid") {
    return { message: "Indiquez l’identifiant ou le nom du client." };
  }
  if (found.kind === "none") return { introuvable: true };
  if (found.kind === "many") return { choix: await withDossierCounts(admin, found.customers) };
  const customer = found.customer as CustomerListRow & Pick<CrmCustomer, "company_role">;
  const { data: roleRow } = await admin
    .from("crm_customers")
    .select("company_role, spending_allowance, stripe_customer_id")
    .eq("id", customer.id)
    .maybeSingle();
  const ledgerWindow = mcpWindow(input, 15);
  const creditsPromise = postedClientCredits(admin, customer.id, ledgerWindow.from + ledgerWindow.limite + 1);
  const role = roleRow as { company_role?: CrmCustomer["company_role"]; stripe_customer_id?: string | null } | null;
  try {
    const { reconcileLedgerSepa } = await import("@/lib/crm/client-ledger-load");
    await reconcileLedgerSepa({
      id: customer.id,
      company_role: role?.company_role ?? null,
      stripe_customer_id: role?.stripe_customer_id ?? null,
    });
  } catch (error) {
    console.error("[sepa]", error instanceof Error ? error.message : "rapprochement");
  }
  const ledger = await loadClientLedger(
    admin,
    {
      id: customer.id,
      company_role: (roleRow as { company_role?: CrmCustomer["company_role"] } | null)?.company_role ?? null,
      first_name: customer.first_name,
      last_name: customer.last_name,
      spending_allowance: (roleRow as { spending_allowance?: number | null } | null)?.spending_allowance ?? null,
    },
    "staff"
  );
  return {
    client: customerFullName(customer),
    lien: clientLedgerAdminHref(customer.id),
    solde: formatMoney(ledger.balanceValue, ledger.currency),
    solde_valeur: ledger.balanceValue,
    sens:
      ledger.sepaHolds.length && ledger.balanceValue >= 0
        ? "prélèvement SEPA en cours"
        : ledger.balanceValue > 0
          ? "avoir"
          : ledger.balanceValue < 0
            ? "reste à payer"
            : "soldé",
    prelevements_sepa: ledger.sepaHolds.map((hold) => ({
      statut: "en cours",
      montant: formatMoney(hold.amount, hold.currency),
      part: hold.partLabel,
      rib: hold.last4 ? `••••${hold.last4}` : null,
      lance_le: hold.launchedAt,
      reference: hold.paymentIntentId,
    })),
    devises: ledger.wallets.map((wallet) => ({
      devise: wallet.currency,
      solde: formatMoney(wallet.balanceValue, wallet.currency),
      solde_valeur: wallet.balanceValue,
    })),
    mouvements: mcpSlice(ledger.movements, ledgerWindow).rows.map((row) => ({
      id: row.id,
      titre: row.title,
      montant: row.amountLabel,
      montant_valeur: row.amountValue ?? null,
      source: row.source ?? null,
      date: row.occurredLabel,
      reference: row.reference,
      lieu: row.whenWhere,
      voyageurs: ledgerTravelerLabel(row.travelerNames, 0),
      lien: row.bookingId ? `/admin/reservations/${row.bookingId}` : null,
    })),
    credits: mcpSlice(await creditsPromise, ledgerWindow).rows,
    page: ledgerWindow.page,
    limite: ledgerWindow.limite,
    suite: mcpSlice(ledger.movements, ledgerWindow).suite || mcpSlice(await creditsPromise, ledgerWindow).suite,
    page_suivante:
      mcpSlice(ledger.movements, ledgerWindow).suite || mcpSlice(await creditsPromise, ledgerWindow).suite
        ? ledgerWindow.page + 1
        : null,
  };
}

async function postedClientCredits(admin: ReturnType<typeof db>, customerId: string, take = 80) {
  const { data, error } = await admin
    .from("crm_transactions")
    .select("id, amount, currency, source, kind, label, occurred_on, external_id, status, direction")
    .eq("customer_id", customerId)
    .eq("direction", "credit")
    .eq("status", "posted")
    .order("occurred_on", { ascending: false })
    .limit(take);
  if (error) {
    logRead("credits", error);
    return [];
  }
  return clientCreditLines((data || []) as Parameters<typeof clientCreditLines>[0]);
}

export async function readRevolutEnAttente(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  try {
    await splitPendingStripePayouts(admin);
  } catch (err) {
    logRead("revolut-stripe", err as { message?: string });
  }
  const window = mcpWindow(input, INBOX_LIMIT);
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("id, amount, currency, counterparty_name, reference, booked_at, status, direction, category, parent_id, stripe_line, raw")
    .eq("direction", "credit")
    .or("status.eq.unmatched,category.eq.frais,category.eq.remboursement,category.eq.stripe_paiement")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    logRead("revolut", error);
    throw new Error("Lecture impossible.");
  }
  const loaded = (data || []) as CrmRevolutTransaction[];
  const visible = loaded.filter((row) => revolutInboxVisible(row, loaded, "unmatched"));
  const rows = mcpSlice(visible, window);
  const parentIds = [...new Set(rows.rows.map((row) => row.parent_id).filter((id): id is string => Boolean(id)))];
  const parents = parentIds.length
    ? await admin.from("crm_revolut_transactions").select("id, amount, currency").in("id", parentIds)
    : { data: [] as { id: string; amount: number; currency: string }[] };
  const payoutAmount = new Map(
    ((parents.data || []) as { id: string; amount: number; currency: string }[]).map((row) => [
      row.id,
      formatMoney(Number(row.amount), row.currency || "EUR"),
    ])
  );
  const stripeLines = rows.rows.filter((row) => row.stripe_line && row.stripe_line.kind === "paiement");
  const intentIds = stripeLines
    .map((row) => row.stripe_line?.payment_intent_id)
    .filter((id): id is string => Boolean(id));
  const inbox = intentIds.length
    ? await admin
        .from("crm_stripe_transactions")
        .select("stripe_payment_intent_id, payer_name, payer_email, reference, raw")
        .in("stripe_payment_intent_id", intentIds.slice(0, 80))
    : { data: [] as { stripe_payment_intent_id?: string; payer_name?: string | null; payer_email?: string | null; reference?: string | null; raw?: unknown }[] };
  const inboxByIntent = new Map(
    ((inbox.data || []) as { stripe_payment_intent_id?: string; payer_name?: string | null; payer_email?: string | null; reference?: string | null; raw?: unknown }[])
      .filter((row) => row.stripe_payment_intent_id)
      .map((row) => [String(row.stripe_payment_intent_id), row])
  );
  const people = stripeLines.length
    ? (((await admin.from("crm_customers").select(STRIPE_MATCH_SELECT)).data || []) as StripeMatchCustomer[])
    : [];
  const hints = stripeLines.length
    ? await loadStripeSuggestHints(admin, {
        stripeCustomerIds: stripeLines.map((row) => row.stripe_line?.stripe_customer_id || ""),
        numbers: stripeLines.map((row) => row.reference || row.stripe_line?.dossier_ref || ""),
      }).catch(() => ({ history: [], pieces: [] }))
    : { history: [], pieces: [] };
  return {
    lien: "/admin/argent?onglet=a-encaisser",
    page: rows.page,
    limite: rows.limite,
    suite: rows.suite,
    page_suivante: rows.page_suivante,
    virements: rows.rows.map((row) => {
      const copy = revolutInboxCopy(row);
      const amount = Number(row.amount);
      const line = row.stripe_line;
      const known = line?.payment_intent_id ? inboxByIntent.get(line.payment_intent_id) : undefined;
      const email = line?.email || known?.payer_email || null;
      const nom = line?.name || known?.payer_name || null;
      const stripeCustomer =
        line?.stripe_customer_id ||
        (known?.raw && typeof known.raw === "object" ? String((known.raw as { stripe_customer_id?: unknown }).stripe_customer_id || "") : "");
      const designation = pieceDigits(row.reference) || pieceDigits(known?.reference) || pieceDigits(line?.dossier_ref) || row.reference;
      const shown =
        line && line.kind === "paiement"
          ? stripeShownCandidate(
              scoreStripeMatches(
                { payer_name: nom, payer_email: email, reference: designation, raw: { stripe_customer_id: stripeCustomer || null } },
                people,
                hints
              ).candidates
            )
          : null;
      return {
        id: row.id,
        montant: `${amount < 0 ? "−" : "+"}${formatMoney(Math.abs(amount), row.currency || "EUR")}`,
        expediteur: copy.sender,
        libelle: copy.designation || row.reference,
        date: row.booked_at ? formatDateFr(row.booked_at) : null,
        categorie: row.category || "client",
        crediter: revolutRowCollectable(row),
        stripe:
          line && line.kind && line.kind !== "cache"
            ? {
                reference: line.payment_intent_id || line.payment_id || null,
                nom,
                email,
                suggestion: shown
                  ? { client_id: shown.customer_id, libelle: shown.label, raison: matchStripeReasonLabel(shown.reason) }
                  : null,
                brut: formatMoney(Number(line.gross || 0), line.currency || row.currency || "EUR"),
                frais: formatMoney(Number(line.fee || 0), line.currency || row.currency || "EUR"),
                net: formatMoney(Number(line.net || 0), line.currency || row.currency || "EUR"),
                dossier: line.dossier_ref || null,
                client_id: line.customer_id || null,
                dossier_id: line.booking_id || null,
                deja_encaisse: Boolean(line.deja_encaisse || row.status === "matched"),
                versement: row.parent_id ? payoutAmount.get(row.parent_id) || null : null,
              }
            : null,
      };
    }),
  };
}

const DEBIT_STATE: Record<string, string> = {
  unmatched: "à rapprocher",
  matched: "rapprochée",
  ignored: "refusée",
};

export async function readRevolutDebits(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  const window = mcpWindow(input, INBOX_LIMIT);
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select(
      "id, amount, currency, counterparty_name, reference, booked_at, raw, direction, status, matched_customer_id, matched_booking_id"
    )
    .eq("direction", "debit")
    .order("status", { ascending: false })
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(window.from + window.limite + 1);
  if (error) {
    logRead("revolut-debits", error);
    throw new Error("Lecture impossible.");
  }
  const rows = mcpSlice((data || []) as CrmRevolutTransaction[], window).rows;
  const customerIds = [
    ...new Set(rows.map((row) => row.matched_customer_id).filter((id): id is string => Boolean(id))),
  ];
  const bookingIds = [
    ...new Set(rows.map((row) => row.matched_booking_id).filter((id): id is string => Boolean(id))),
  ];
  const [people, stays] = await Promise.all([
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
    bookingIds.length
      ? admin.from("crm_bookings").select("id, reference").in("id", bookingIds)
      : Promise.resolve({ data: [] as { id: string; reference: string }[] }),
  ]);
  const names = new Map(
    ((people.data || []) as { id: string; first_name: string | null; last_name: string | null }[]).map((row) => [
      row.id,
      customerFullName({ first_name: row.first_name || "", last_name: row.last_name || "" }),
    ])
  );
  const references = new Map(
    ((stays.data || []) as { id: string; reference: string }[]).map((row) => [row.id, row.reference])
  );
  const page = mcpSlice((data || []) as CrmRevolutTransaction[], window);
  return {
    lien: "/admin/argent?onglet=a-pointer&vue=revolut",
    page: page.page,
    limite: page.limite,
    suite: page.suite,
    page_suivante: page.page_suivante,
    debits: rows.map((row) => {
      const line = revolutDebitLine(row);
      return {
        id: line.id,
        beneficiaire: line.party,
        montant: formatMoney(-line.amount, line.currency),
        nature: line.kind,
        libelle: line.reference || null,
        date: line.bookedAt ? formatDateFr(line.bookedAt) : null,
        etat: DEBIT_STATE[line.status] || "à rapprocher",
        client: row.matched_customer_id ? names.get(row.matched_customer_id) || null : null,
        dossier: row.matched_booking_id ? references.get(row.matched_booking_id) || null : null,
      };
    }),
  };
}

function proposedMatch(hit: OutgoingLine["suggestions"][number]) {
  return {
    reference: hit.reference,
    dossier_titre: hit.title || null,
    client_nom: dossierClientLabel(hit),
    confiance: hit.confidence,
    raisons: costSuggestionSummary(hit),
    voyageurs: hit.passengers,
  };
}

/** Un coût rattaché, pour comptabilite_voyage : cout_id sert à detacher, sortie_id est le mouvement. */
export function mcpTripCost(cost: TripCost, eur: (value: number) => string = (value) => formatMoney(value, "EUR")) {
  return {
    cout_id: cost.id,
    sortie_id: cost.sourceId,
    source: cost.source === "pliant" ? "Pliant" : "Revolut",
    fournisseur: cost.supplier,
    montant: eur(cost.amountEur),
    date: cost.occurredOn ? formatDateFr(cost.occurredOn) : null,
    etat: cost.state === "pending" ? "en attente" : "confirmé",
  };
}

const PLIANT_DEBIT_STATE: Record<string, string> = {
  unmatched: "à pointer",
  matched: "rattachée",
  ignored: "hors voyage",
};

/** Dépenses Pliant, comme revolut_debits. La date est l’autorisation. La proposition ne rattache pas. */
export async function readPliantDebits(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  const window = mcpWindow(input, INBOX_LIMIT);
  const { data, error } = await admin
    .from("crm_pliant_transactions")
    .select("id, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, type, status, match_status, booked_at, raw, card_last4")
    .in("type", ["PURCHASE", "CASH_WITHDRAWAL", "REFUND", "CHARGEBACK"])
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(window.from + window.limite + 1);
  if (error) {
    logRead("pliant-debits", error);
    throw new Error("Lecture impossible.");
  }
  const page = mcpSlice(
    (data || []) as {
      id: string;
      merchant: string | null;
      billing_cents: number | null;
      billing_currency: string | null;
      transaction_cents: number | null;
      transaction_currency: string | null;
      type: string | null;
      status: string | null;
      match_status: string | null;
      booked_at: string | null;
      raw: unknown;
      card_last4: string | null;
    }[],
    window
  );
  const queue = page.rows.some((row) => (row.match_status || "unmatched") === "unmatched")
    ? await loadOutgoingQueue({ source: "pliant", limit: 500 }, admin).catch(() => [])
    : [];
  const suggestions = new Map(queue.map((line) => [line.id, line]));
  return {
    lien: "/admin/argent?onglet=a-pointer&vue=pliant",
    page: page.page,
    limite: page.limite,
    suite: page.suite,
    page_suivante: page.page_suivante,
    debits: page.rows.map((row) => {
      const currency = (row.transaction_currency || row.billing_currency || "EUR").toUpperCase();
      const cents = row.transaction_cents ?? row.billing_cents;
      const amount = cents == null ? null : Math.abs(cents) / 100;
      const hit = suggestions.get(row.id)?.suggestions[0] || null;
      return {
        id: row.id,
        date_autorisation: formatDateFr(pliantAuthorizationAt(row.raw, row.booked_at)),
        carte: (row.card_last4 || "").replace(/\D/g, "").slice(-4) || null,
        commercant: row.merchant,
        montant: amount == null ? null : formatMoney(row.type === "REFUND" || row.type === "CHARGEBACK" ? amount : -amount, currency),
        devise: currency,
        etat: PLIANT_DEBIT_STATE[row.match_status || "unmatched"] || "à pointer",
        suggestion: hit ? proposedMatch(hit) : null,
      };
    }),
  };
}

/** Comptabilité d’un voyage : ventes, coûts rattachés, marge par ligne, facture MB3M. Rien côté client. */
export async function readComptabiliteVoyage(input: { id?: string; reference?: string }) {
  const admin = db();
  const id = (input.id || "").trim();
  const reference = (input.reference || "").trim();
  if (!id && !reference) return { message: "Indiquez l’identifiant ou la référence du dossier." };
  let query = admin
    .from("crm_bookings")
    .select("id, reference, title, destination, client_settles_stay, agency_commission, customer_id, billing_customer_id");
  if (id) {
    if (!UUID.test(id)) return { message: "Identifiant inconnu." };
    query = query.eq("id", id);
  } else {
    query = query.eq("reference", reference);
  }
  const { data, error } = await query.limit(2);
  if (error) {
    logRead("comptabilite", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as {
    id: string;
    reference: string;
    title: string | null;
    destination: string | null;
    client_settles_stay: boolean | null;
    agency_commission?: boolean | null;
    customer_id?: string | null;
    billing_customer_id?: string | null;
  }[];
  if (!rows.length) return { introuvable: true };
  if (rows.length > 1) return { choix: rows.map((row) => ({ id: row.id, reference: row.reference, titre: row.title || row.destination })) };
  const booking = rows[0];
  const [{ data: items }, inputs] = await Promise.all([
    admin.from("crm_booking_items").select("id, kind, details, lifecycle").eq("booking_id", booking.id),
    loadDossierAccountingInputs(admin, booking.id),
  ]);
  const view = await buildTripAccountingView(
    admin,
    booking,
    ((items || []) as { id: string; kind: string | null; details: Record<string, unknown> | null; lifecycle: string | null }[]).filter(
      (item) => item.lifecycle !== "superseded" && item.lifecycle !== "cancelled"
    ),
    inputs
  );
  let commission: ResolvedAgencyFee = { rate: 0.1, source: "defaut" };
  try {
    const fees = await loadResolvedAgencyFees(admin, [booking]);
    commission = fees.get(booking.id) || commission;
  } catch (err) {
    logRead("commission", err as { code?: string; message?: string });
  }
  const eur = (value: number) => formatMoney(value, "EUR");
  const costLine = (cost: TripCost) => mcpTripCost(cost, eur);
  return {
    lien: `/admin/reservations/${booking.id}?tab=argent`,
    reference: booking.reference,
    titre: booking.title || booking.destination,
    commission_agence: formatAgencyFeePercent(commission.rate),
    commission_source: commission.source,
    commission_appliquee: booking.agency_commission === true,
    etat: TRIP_ACCOUNTING_LABELS[view.state],
    lignes: view.lines.map((line) => ({
      carte_id: line.itemId,
      vente: line.label,
      vendu: eur(line.sale),
      cout: eur(line.cost),
      marge: eur(line.margin),
      couts: line.costs.map(costLine),
    })),
    couts_sans_vente: view.unsold.map(costLine),
    totaux: {
      vendu: eur(view.totals.sale),
      cout: eur(view.totals.cost),
      marge: eur(view.totals.margin),
    },
    sorties_proposees: view.proposed.map((line) => ({
      sortie_id: line.id,
      source: line.source === "pliant" ? "Pliant" : "Revolut",
      beneficiaire: line.party,
      montant: formatMoney(line.refund ? line.amount : -line.amount, line.currency),
      date: line.occurredOn ? formatDateFr(line.occurredOn) : null,
      carte: line.last4 || null,
      proposition: line.suggestions[0] ? { ...proposedMatch(line.suggestions[0]), ligne: line.suggestions[0].itemLabel } : null,
    })),
    facture: {
      numero: view.invoice.number,
      imprimee: view.invoice.printed,
      marge_a_corriger: view.invoice.marginStale,
    },
    anomalies: view.anomalies,
  };
}

const EMAIL_STATUS: Record<string, string> = {
  received: "reçu",
  parsed: "lu",
  matched: "proposition",
  error: "erreur",
};

export async function readStripeEnAttente(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  const window = mcpWindow(input, INBOX_LIMIT);
  const { data, error } = await admin
    .from("crm_stripe_transactions")
    .select("id, amount, currency, payer_name, payer_email, reference, method, booked_at, status, direction, raw")
    .eq("status", "unmatched")
    .eq("direction", "credit")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(window.from + window.limite + 1);
  if (error) {
    logRead("stripe", error);
    throw new Error("Lecture impossible.");
  }
  const rows = mcpSlice(
    (data || []) as Pick<
      CrmStripeTransaction,
      "id" | "amount" | "currency" | "payer_name" | "payer_email" | "reference" | "method" | "booked_at" | "raw"
    >[],
    window
  );
  const people = rows.rows.length
    ? ((
        await admin.from("crm_customers").select(STRIPE_MATCH_SELECT)
      ).data || []) as StripeMatchCustomer[]
    : [];
  const hints = rows.rows.length
    ? await loadStripeSuggestHints(admin, {
        stripeCustomerIds: rows.rows.map((row) => {
          const id = row.raw && typeof row.raw === "object" ? (row.raw as { stripe_customer_id?: unknown }).stripe_customer_id : null;
          return typeof id === "string" ? id : "";
        }),
        numbers: rows.rows.map((row) => row.reference || ""),
      }).catch(() => ({ history: [], pieces: [] }))
    : { history: [], pieces: [] };
  return {
    lien: "/admin/argent?onglet=a-encaisser",
    page: rows.page,
    limite: rows.limite,
    suite: rows.suite,
    page_suivante: rows.page_suivante,
    paiements: rows.rows.map((row) => {
      const shown = stripeShownCandidate(scoreStripeMatches(row, people, hints).candidates);
      return {
        id: row.id,
        montant: formatMoney(Number(row.amount), row.currency || "EUR"),
        payeur: row.payer_name,
        nom: row.payer_name,
        email: row.payer_email,
        libelle: row.reference,
        moyen: row.method,
        date: row.booked_at ? formatDateFr(row.booked_at) : null,
        suggestion: shown
          ? { client_id: shown.customer_id, libelle: shown.label, raison: matchStripeReasonLabel(shown.reason) }
          : null,
      };
    }),
  };
}

export async function readEmailsEnAttente(input: { page?: number; limite?: number } = {}) {
  const admin = db();
  const window = mcpWindow(input, INBOX_LIMIT);
  const { data, error } = await admin
    .from("crm_email_ingest")
    .select("id, label, from_email, subject, received_at, status, candidates, error, extract")
    .in("status", [...EMAIL_INBOX_QUEUE_STATUSES])
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(window.from + window.limite + 1);
  if (error) {
    logRead("emails", error);
    throw new Error("Lecture impossible.");
  }
  const rows = mcpSlice(
    (data || []) as Pick<
      CrmEmailIngest,
      "id" | "label" | "from_email" | "subject" | "received_at" | "status" | "candidates" | "error" | "extract"
    >[],
    window
  );
  const known = rows.rows.length ? await loadStayAnchors(admin) : [];
  return {
    lien: "/admin/boite?onglet=fournisseurs",
    page: rows.page,
    limite: rows.limite,
    suite: rows.suite,
    page_suivante: rows.page_suivante,
    mails: rows.rows.map((row) => {
      const verdict = extractCancellationVerdict(
        { label: row.label, receivedAt: row.received_at, extract: parseStoredExtract(row.extract) },
        known
      );
      return {
        id: row.id,
        expediteur: row.from_email,
        sujet: row.subject,
        recu_le: row.received_at ? formatDateFr(row.received_at) : null,
        label: row.label,
        statut: EMAIL_STATUS[row.status] || row.status,
        suivi: verdict.suivi,
        alerte: verdict.alerte,
        remplacee_par: verdict.remplacee_par,
        propositions: (row.candidates || []).slice(0, 5).map((candidate) => ({
          libelle: candidate.label,
          client_id: candidate.customer_id,
          dossier_id: candidate.booking_id || null,
        })),
        erreur: row.error,
      };
    }),
  };
}

export async function readLittleEmperorsEnAttente(admin = db(), input: { page?: number; limite?: number } = {}) {
  const { data, error } = await queryWithOptionalColumn(
    (columns) => admin.from("crm_le_bookings").select(columns).eq("status", "unmatched"),
    MCP_LE_LIST_COLUMNS,
    "booked_at"
  );
  if (error) {
    logRead("little-emperors", { code: error.code || undefined, message: error.message || undefined });
    throw new Error("Lecture impossible.");
  }
  const mails = await loadLeConfirmationMails(admin);
  const rows = ((data || []) as unknown as (Pick<
    CrmLeBooking,
    | "id"
    | "confirmation_number"
    | "state"
    | "hotel_name"
    | "hotel_id"
    | "city"
    | "country"
    | "check_in"
    | "check_out"
    | "guest_names"
    | "candidates"
    | "currency"
    | "total_cost"
    | "le_booking_id"
    | "created_at"
  > & { raw?: unknown; booked_at?: string | null })[])
    .map((row) => ({ ...row, booked_on: leListMadeAt(row, mails) }))
    .sort((left, right) => compareLeMadeAt(left.booked_on, right.booked_on) || left.id.localeCompare(right.id));
  const window = mcpWindow(input, INBOX_LIMIT);
  const page = mcpSlice(rows, window);
  const known = page.rows.length ? await loadStayAnchors(admin) : [];
  return {
    lien: "/admin/boite?onglet=fournisseurs&source=little-emperors",
    page: page.page,
    limite: page.limite,
    suite: page.suite,
    page_suivante: page.page_suivante,
    sejours: page.rows.map((row) => {
      const verdict = leCancellationVerdict(row, known);
      return {
        hotel: row.hotel_name,
        ville: row.city,
        pays: row.country,
        arrivee: row.check_in,
        depart: row.check_out,
        reservee_le: leMadeDayLabel(row.booked_on),
        voyageurs: row.guest_names,
        confirmation: row.confirmation_number,
        etat_le: row.state,
        statut: cancellationStatut(row.state, verdict),
        suivi: verdict.suivi,
        alerte: verdict.alerte,
        remplacee_par: verdict.remplacee_par,
        montant_lu: row.total_cost ? `${row.total_cost} ${row.currency || ""}`.trim() : null,
        propositions: (row.candidates || []).slice(0, 5).map((candidate) => candidate.label),
      };
    }),
  };
}
