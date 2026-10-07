import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { loadAgencyAccounts } from "@/lib/crm/agency-accounts";
import { adminBadges } from "@/lib/crm/admin-badges";
import {
  BOOKING_SORTS,
  joinOrFilters,
  orSearchFilter,
  phoneSearchFilter,
  searchPattern,
  type BookingStateFilter,
  type FilterableQuery,
} from "@/lib/crm/admin-list";
import { adminTodoLines } from "@/lib/crm/admin-todo";
import { flightCities, flightIata, hotelDisplayName } from "@/lib/crm/carnet";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { loadOpenEstaNotices } from "@/lib/crm/esta-run";
import { clientLedgerAdminHref, loadClientLedger } from "@/lib/crm/client-ledger";
import { CUSTOMER_LIST_SELECT, CUSTOMER_NAME_SELECT, type CustomerListRow, type CustomerNameRow } from "@/lib/crm/customer-search";
import { formatDateFr, formatMoney, isoDateInDays, todayIsoDate } from "@/lib/crm/money";
import { serviceDeskLines, type ServiceDeskItem } from "@/lib/crm/service-desk";
import { staffLedgerCaption, staffStayLabel } from "@/lib/crm/staff-stay";
import { reviewIdentityPieces } from "@/lib/crm/trip-documents";
import {
  DOC_TYPE_LABELS,
  EMAIL_INBOX_QUEUE_STATUSES,
  customerFullName,
  isActiveItem,
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
import { CLIENT_VISA_STEPS, clientVisaStepCopy, type ClientVisaStep } from "@/lib/crm/visa-flow";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";
import { deskView, reasonLabel, type DeskTask } from "@/lib/crm/visa-desk";
import { createServiceClient } from "@/lib/supabase/admin";

const LIST_LIMIT = 20;
const INBOX_LIMIT = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICE_KINDS = ["chauffeur", "greeter", "checkin"] as const;

const BOOKING_COLUMNS =
  "id, reference, title, destination, status, start_date, end_date, currency, total_amount, agency_commission, visible_to_client, archived_at, customer_id, client_settles_stay, include_in_ledger";

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
  archived_at?: string | null;
  client_settles_stay?: boolean | null;
  include_in_ledger?: boolean | null;
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
    lien: `/admin/clients/${row.id}`,
  };
}

function bookingLine(row: BookingRow, names: Map<string, string>, amounts: Map<string, number>) {
  const amount = amounts.get(row.id);
  return {
    id: row.id,
    reference: row.reference,
    titre: row.title,
    destination: row.destination,
    dates: [row.start_date, row.end_date].filter(Boolean).join(" → ") || null,
    etat: staffStayLabel(row),
    statut: staffStayLabel(row),
    client: names.get(row.customer_id) || null,
    montant: amount == null ? null : formatMoney(amount, row.currency || "EUR"),
    grand_livre: staffLedgerCaption(row),
    lien: `/admin/reservations/${row.id}`,
  };
}

type VisaTaskRow = {
  booking_id: string;
  holder_name: string;
  reference: string;
  reasons: DeskTask["reasons"] | null;
  done_at: string | null;
  created_at: string;
};

type ServiceBookingRow = { id: string; reference: string; status: string; customer_id: string };

function visaTasks(rows: VisaTaskRow[]): DeskTask[] {
  return rows.map((row) => ({
    bookingId: row.booking_id,
    holderName: row.holder_name,
    reference: row.reference,
    reasons: row.reasons || [],
    doneAt: row.done_at,
    createdAt: row.created_at,
  }));
}

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
  const weekAgo = isoDateInDays(-7);
  const [
    badges,
    balances,
    comptes,
    bookingCount,
    departSoon,
    departTomorrow,
    tasks,
    activeBookings,
  ] = await Promise.all([
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
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("start_date", isoDateInDays(1))
      .neq("status", "cancelled")
      .is("archived_at", null),
    admin
      .from("crm_visa_tasks")
      .select("booking_id, holder_name, reference, reasons, done_at, created_at")
      .or(`done_at.is.null,done_at.gte.${weekAgo}`)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("crm_bookings")
      .select("id, reference, status, customer_id")
      .neq("status", "cancelled")
      .is("archived_at", null)
      .or(`end_date.is.null,end_date.gte.${isoDateInDays(-1)}`)
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(300),
  ]);
  const desk = deskView(visaTasks((tasks.data || []) as VisaTaskRow[]), today);
  const services = await openServiceLines(admin, (activeBookings.data || []) as ServiceBookingRow[]);
  const remaining = ((balances.data || []) as { balance: number | string }[]).reduce(
    (sum, row) => sum + Math.max(0, -Number(row.balance) || 0),
    0
  );
  return {
    a_faire: adminTodoLines({
      emails: badges.emails,
      le: badges.le,
      formalities: desk.open.length,
      services: services.length,
      departTomorrow: departTomorrow.count ?? 0,
      expiring: badges.pieces,
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
  };
}

async function searchCustomers(admin: SupabaseClient, q: string, limit = LIST_LIMIT) {
  const pattern = searchPattern(q);
  let query = admin.from("crm_customers").select(CUSTOMER_LIST_SELECT).order("last_name").limit(limit);
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
  const { data, error } = await query;
  if (error) {
    logRead("clients", error);
    throw new Error("Lecture impossible.");
  }
  return (data || []) as CustomerListRow[];
}

export async function readChercherClients(input: { q?: string; echeance?: boolean }) {
  const admin = db();
  if (input.echeance) {
    const { data, error } = await admin
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on, first_name, last_name, number, companion_id, booking_id, traveler_id")
      .not("expires_on", "is", null)
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on")
      .limit(40);
    if (error) {
      logRead("pieces", error);
      throw new Error("Lecture impossible.");
    }
    const docs = reviewIdentityPieces((data || []) as CrmTravelDocument[]);
    const names = await customerNames(admin, docs.map((doc) => doc.customer_id));
    return {
      pieces: docs.map((doc) => pieceLine(doc, names)),
    };
  }
  const q = (input.q || "").trim();
  if (!q) {
    const { count, error } = await admin.from("crm_customers").select("id", { count: "exact", head: true });
    if (error) logRead("clients", error);
    return {
      message: "Indiquez un nom, une société, un e-mail, un téléphone, ou echeance pour les pièces.",
      clients: count ?? 0,
    };
  }
  const rows = await searchCustomers(admin, q);
  return { clients: rows.map(customerLine) };
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
  const rows = await searchCustomers(admin, q, 8);
  if (!rows.length) return { kind: "none" as const };
  if (rows.length > 1) return { kind: "many" as const, customers: rows };
  return { kind: "one" as const, customer: rows[0] };
}

export async function readFicheClient(input: { id?: string; q?: string }) {
  const admin = db();
  const found = await oneCustomer(admin, input);
  if (found.kind === "missing" || found.kind === "invalid") {
    return { message: "Indiquez l’identifiant ou le nom du client." };
  }
  if (found.kind === "none") return { introuvable: true };
  if (found.kind === "many") return { choix: found.customers.map(customerLine) };
  const customer = found.customer;
  const [{ data: balances }, { data: docs }] = await Promise.all([
    admin.from("crm_customer_balances").select("currency, balance").eq("customer_id", customer.id),
    admin
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on, first_name, last_name, number, companion_id, booking_id, traveler_id")
      .eq("customer_id", customer.id)
      .not("expires_on", "is", null)
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on")
      .limit(20),
  ]);
  const wallets = ((balances || []) as { currency: string; balance: number | string }[]).map((row) => ({
    devise: row.currency || "EUR",
    solde: formatMoney(Number(row.balance), row.currency || "EUR"),
    solde_valeur: Number(row.balance),
    sens: Number(row.balance) > 0 ? "avoir" : Number(row.balance) < 0 ? "reste à payer" : "soldé",
  }));
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
  if (input.etat === "preparation") next = next.eq("visible_to_client", false);
  if (input.etat === "montre") next = next.eq("visible_to_client", true);
  if (input.etat === "a-venir") next = next.gte("start_date", input.today).neq("status", "cancelled");
  return next;
}

export async function readChercherDossiers(input: { q?: string; etat?: BookingStateFilter | null }) {
  const admin = db();
  const q = (input.q || "").trim();
  const etat = input.etat ?? (q ? null : "a-venir");
  const today = todayIsoDate();
  const pattern = searchPattern(q);
  let matchedCustomerIds: string[] = [];
  if (pattern) {
    const { data } = await admin
      .from("crm_customers")
      .select("id")
      .or(joinOrFilters(orSearchFilter(pattern, ["first_name", "last_name", "company_name"]), phoneSearchFilter(q)))
      .limit(50);
    matchedCustomerIds = ((data || []) as { id: string }[]).map((row) => row.id);
  }
  let query = admin.from("crm_bookings").select(BOOKING_COLUMNS) as unknown as FilterableQuery;
  query = applyBookingFilters(query, { etat, today });
  if (pattern) {
    query = query.or(orSearchFilter(pattern, ["reference", "title", "destination"], "customer_id", matchedCustomerIds));
  }
  const order = etat === "a-venir" || !etat ? BOOKING_SORTS["depart-asc"] : BOOKING_SORTS.depart;
  const { data, error } = await (
    query as unknown as {
      order: (column: string, opts: { ascending: boolean; nullsFirst: boolean }) => {
        limit: (n: number) => Promise<{ data: BookingRow[] | null; error: { code?: string } | null }>;
      };
    }
  )
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .limit(LIST_LIMIT);
  if (error) {
    logRead("dossiers", error);
    throw new Error("Lecture impossible.");
  }
  const rows = data || [];
  const [names, amounts] = await Promise.all([
    customerNames(admin, rows.map((row) => row.customer_id)),
    loadDisplayedStayAmounts(admin, rows),
  ]);
  return {
    etat: etat || "recherche",
    dossiers: rows.map((row) => bookingLine(row, names, amounts)),
  };
}

function cardLine(item: Pick<CrmBookingItem, "kind" | "title" | "supplier" | "confirmation_ref" | "start_at" | "end_at" | "details" | "visible_to_client">) {
  const full = item as CrmBookingItem;
  const city = typeof item.details?.city === "string" ? item.details.city : null;
  if (item.kind === "flight") {
    return {
      kind: "vol",
      titre: flightCities(full) || item.title,
      aeroports: flightIata(full) || null,
      debut: item.start_at,
      fin: item.end_at,
      reference: item.confirmation_ref,
      montre: item.visible_to_client,
    };
  }
  if (item.kind === "hotel") {
    return {
      kind: "hôtel",
      titre: hotelDisplayName(full),
      ville: city,
      debut: item.start_at,
      fin: item.end_at,
      reference: item.confirmation_ref,
      montre: item.visible_to_client,
    };
  }
  return {
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

export async function readFicheDossier(input: { id?: string; reference?: string }) {
  const admin = db();
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
    const names = await customerNames(admin, rows.map((row) => row.customer_id));
    return { choix: rows.map((row) => bookingLine(row, names, new Map())) };
  }
  const booking = rows[0];
  const [{ data: items }, { data: travelers }, { data: visas }, { data: tasks }, names, amounts] = await Promise.all([
    admin
      .from("crm_booking_items")
      .select("id, kind, title, supplier, confirmation_ref, start_at, end_at, details, lifecycle, visible_to_client, sort_order")
      .eq("booking_id", booking.id)
      .order("sort_order"),
    admin.from("crm_booking_travelers").select("first_name, last_name").eq("booking_id", booking.id),
    admin.from("crm_visa_requests").select("country, status, step").eq("booking_id", booking.id),
    admin.from("crm_visa_tasks").select("holder_name, reasons, done_at").eq("booking_id", booking.id).is("done_at", null),
    customerNames(admin, [booking.customer_id]),
    loadDisplayedStayAmounts(admin, [booking]),
  ]);
  const cards = ((items || []) as CrmBookingItem[]).filter((item) => isActiveItem(item)).map(cardLine);
  return {
    ...bookingLine(booking, names, amounts),
    voyageurs: ((travelers || []) as { first_name: string | null; last_name: string | null }[]).map((row) =>
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim()
    ),
    cartes: cards,
    formalites: [
      ...((visas || []) as { country: string; status: string | null; step: string | null }[])
        .filter((row) => row.status === "refuse" || (row.step !== "piece" && row.status !== "piece"))
        .map((row) => ({
          pays: corridorName(row.country),
          etape: visaStepLabel(row.step),
          statut: row.status,
        })),
      ...((tasks || []) as { holder_name: string; reasons: DeskTask["reasons"] }[]).map((row) => ({
        tache: reasonLabel(row.reasons || []),
        voyageur: row.holder_name,
      })),
    ],
  };
}

export async function readFormalites() {
  const admin = db();
  const today = todayIsoDate();
  const [tasks, visas, esta] = await Promise.all([
    admin
      .from("crm_visa_tasks")
      .select("booking_id, holder_name, reference, reasons, done_at")
      .is("done_at", null)
      .order("created_at", { ascending: false })
      .limit(40),
    admin.from("crm_visa_requests").select("booking_id, country, status, step").order("updated_at", { ascending: false }).limit(80),
    loadOpenEstaNotices(admin).catch(() => []),
  ]);
  if (tasks.error) logRead("formalites", tasks.error);
  if (visas.error) logRead("visas", visas.error);
  const openVisas = ((visas.data || []) as { booking_id: string; country: string; status: string | null; step: string | null }[]).filter(
    (row) => row.status === "refuse" || (row.step !== "piece" && row.status !== "piece")
  );
  return {
    jour: today,
    taches: ((tasks.data || []) as { booking_id: string; holder_name: string; reference: string; reasons: DeskTask["reasons"] }[]).map(
      (row) => ({
        reference: row.reference,
        voyageur: row.holder_name,
        motif: reasonLabel(row.reasons || []),
        lien: `/admin/reservations/${row.booking_id}`,
      })
    ),
    demandes: openVisas.map((row) => ({
      pays: corridorName(row.country),
      etape: visaStepLabel(row.step),
      statut: row.status,
      lien: `/admin/reservations/${row.booking_id}`,
    })),
    esta: esta.map((row) => ({ label: row.label, lien: row.href })),
  };
}

export async function readServicesAConfirmer() {
  const admin = db();
  const { data } = await admin
    .from("crm_bookings")
    .select("id, reference, status, customer_id")
    .neq("status", "cancelled")
    .is("archived_at", null)
    .or(`end_date.is.null,end_date.gte.${isoDateInDays(-1)}`)
    .limit(300);
  return { services: await openServiceLines(admin, (data || []) as ServiceBookingRow[]) };
}

export async function readGrandLivre(input: { id?: string; q?: string }) {
  const admin = db();
  const found = await oneCustomer(admin, input);
  if (found.kind === "missing" || found.kind === "invalid") {
    return { message: "Indiquez l’identifiant ou le nom du client." };
  }
  if (found.kind === "none") return { introuvable: true };
  if (found.kind === "many") return { choix: found.customers.map(customerLine) };
  const customer = found.customer as CustomerListRow & Pick<CrmCustomer, "company_role">;
  const { data: roleRow } = await admin
    .from("crm_customers")
    .select("company_role, spending_allowance")
    .eq("id", customer.id)
    .maybeSingle();
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
    sens: ledger.balanceValue > 0 ? "avoir" : ledger.balanceValue < 0 ? "reste à payer" : "soldé",
    devises: ledger.wallets.map((wallet) => ({
      devise: wallet.currency,
      solde: formatMoney(wallet.balanceValue, wallet.currency),
      solde_valeur: wallet.balanceValue,
    })),
    mouvements: ledger.movements.slice(0, 15).map((row) => ({
      titre: row.title,
      montant: row.amountLabel,
      date: row.occurredLabel,
      reference: row.reference,
      lieu: row.whenWhere,
      lien: row.bookingId ? `/admin/reservations/${row.bookingId}` : null,
    })),
  };
}

export async function readRevolutEnAttente() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_revolut_transactions")
    .select("id, amount, currency, counterparty_name, reference, booked_at, status, direction")
    .eq("status", "unmatched")
    .eq("direction", "credit")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(INBOX_LIMIT);
  if (error) {
    logRead("revolut", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as Pick<
    CrmRevolutTransaction,
    "id" | "amount" | "currency" | "counterparty_name" | "reference" | "booked_at"
  >[];
  return {
    lien: "/admin/revolut",
    virements: rows.map((row) => ({
      id: row.id,
      montant: formatMoney(Number(row.amount), row.currency || "EUR"),
      expediteur: row.counterparty_name,
      libelle: row.reference,
      date: row.booked_at ? formatDateFr(row.booked_at) : null,
    })),
  };
}

const EMAIL_STATUS: Record<string, string> = {
  received: "reçu",
  parsed: "lu",
  matched: "proposition",
  error: "erreur",
};

export async function readStripeEnAttente() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_stripe_transactions")
    .select("id, amount, currency, payer_name, reference, method, booked_at, status, direction")
    .eq("status", "unmatched")
    .eq("direction", "credit")
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(INBOX_LIMIT);
  if (error) {
    logRead("stripe", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as Pick<
    CrmStripeTransaction,
    "id" | "amount" | "currency" | "payer_name" | "reference" | "method" | "booked_at"
  >[];
  return {
    lien: "/admin/stripe",
    paiements: rows.map((row) => ({
      id: row.id,
      montant: formatMoney(Number(row.amount), row.currency || "EUR"),
      payeur: row.payer_name,
      libelle: row.reference,
      moyen: row.method,
      date: row.booked_at ? formatDateFr(row.booked_at) : null,
    })),
  };
}

export async function readEmailsEnAttente() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_email_ingest")
    .select("id, label, from_email, subject, received_at, status, candidates, error")
    .in("status", [...EMAIL_INBOX_QUEUE_STATUSES])
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(INBOX_LIMIT);
  if (error) {
    logRead("emails", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as Pick<
    CrmEmailIngest,
    "id" | "label" | "from_email" | "subject" | "received_at" | "status" | "candidates" | "error"
  >[];
  return {
    lien: "/admin/emails",
    mails: rows.map((row) => ({
      id: row.id,
      expediteur: row.from_email,
      sujet: row.subject,
      recu_le: row.received_at ? formatDateFr(row.received_at) : null,
      label: row.label,
      statut: EMAIL_STATUS[row.status] || row.status,
      propositions: (row.candidates || []).slice(0, 5).map((candidate) => ({
        libelle: candidate.label,
        client_id: candidate.customer_id,
        dossier_id: candidate.booking_id || null,
      })),
      erreur: row.error,
    })),
  };
}

export async function readLittleEmperorsEnAttente() {
  const admin = db();
  const { data, error } = await admin
    .from("crm_le_bookings")
    .select(
      "id, confirmation_number, state, hotel_name, city, country, check_in, check_out, guest_names, status, candidates, currency, total_cost"
    )
    .eq("status", "unmatched")
    .order("check_in", { ascending: false, nullsFirst: false })
    .limit(INBOX_LIMIT);
  if (error) {
    logRead("little-emperors", error);
    throw new Error("Lecture impossible.");
  }
  const rows = (data || []) as Pick<
    CrmLeBooking,
    | "confirmation_number"
    | "state"
    | "hotel_name"
    | "city"
    | "country"
    | "check_in"
    | "check_out"
    | "guest_names"
    | "candidates"
    | "currency"
    | "total_cost"
  >[];
  return {
    lien: "/admin/little-emperors",
    sejours: rows.map((row) => ({
      hotel: row.hotel_name,
      ville: row.city,
      pays: row.country,
      arrivee: row.check_in,
      depart: row.check_out,
      voyageurs: row.guest_names,
      confirmation: row.confirmation_number,
      etat_le: row.state,
      montant_lu: row.total_cost ? `${row.total_cost} ${row.currency || ""}`.trim() : null,
      propositions: (row.candidates || []).slice(0, 5).map((candidate) => candidate.label),
    })),
  };
}
