import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingsFilters } from "@/components/admin/BookingsFilters";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { ReservationWeek, ReservationsViewToggle } from "@/components/admin/ReservationWeek";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { customerFullName, type CrmBooking } from "@/lib/crm/types";
import { todayIsoDate } from "@/lib/crm/money";
import type { CustomerNameRow } from "@/lib/crm/customer-search";
import { bookingListSearchText } from "@/lib/crm/booking-search";
import { bookingPayerLabel, type FundingCompany } from "@/lib/crm/funding-wallet";
import { smartSearchMatch } from "@/lib/crm/smart-search";
import {
  ADMIN_PAGE_SIZE,
  BOOKING_SORTS,
  bookingSortParam,
  firstParam,
  listHref,
  pageOverflow,
  pageRange,
  parseBookingSort,
  parseBookingState,
  parsePage,
  sortBookingsByProximity,
  type FilterableQuery,
  type SearchParamValue,
} from "@/lib/crm/admin-list";
import { reservationWeek } from "@/lib/crm/reservation-week";
import { stayToday } from "@/lib/crm/stay-moment";

type Props = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

type ListCustomer = CustomerNameRow & {
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

function pickRecord<T>(source: Record<string, T>, ids: Set<string>) {
  const out: Record<string, T> = {};
  for (const id of ids) {
    if (source[id] != null) out[id] = source[id];
  }
  return out;
}

export const metadata = { title: "Réservations" };

export default async function AdminReservationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = (firstParam(params.q) || "").trim();
  const state = parseBookingState(params.etat);
  const sort = parseBookingSort(params.tri);
  const vue = firstParam(params.vue) === "liste" ? "liste" : null;
  const listView = Boolean(q || state || sort !== "proche" || page > 1 || vue);
  const today = stayToday();
  const { supabase } = await requireStaffPage();
  const listeHref = listHref(
    "/admin/reservations",
    {
      q: q || null,
      etat: state,
      tri: bookingSortParam(sort),
      vue: "liste",
    },
    page
  );

  if (!listView) {
    const [{ data: travellingRows, error: travelError }, { data: upcomingRows, error: upcomingError }] = await Promise.all([
      supabase
        .from("crm_bookings")
        .select("*")
        .lt("start_date", today)
        .neq("status", "cancelled")
        .is("archived_at", null)
        .or(`end_date.gte.${today},end_date.is.null`)
        .order("end_date", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("crm_bookings")
        .select("*")
        .gte("start_date", today)
        .neq("status", "cancelled")
        .is("archived_at", null)
        .order("start_date", { ascending: true })
        .limit(400),
    ]);
    const boardError = travelError || upcomingError;
    if (boardError) {
      console.error("[admin/reservations]", boardError.code ?? "?", boardError.message ?? "");
      throw new Error("Réservations indisponibles");
    }
    const pool = [...((travellingRows || []) as CrmBooking[]), ...((upcomingRows || []) as CrmBooking[])];
    const columns = reservationWeek(pool, today);
    const shown = columns.flatMap((column) => column.entries.map((entry) => entry.booking));
    const customerIds = [...new Set(shown.map((row) => row.customer_id).filter(Boolean))];
    const walletIds = [
      ...new Set(shown.flatMap((row) => [row.billing_customer_id, row.customer_id].filter(Boolean))),
    ];
    const [{ data: customerRows }, { data: companyRows }, maps, displayed] = await Promise.all([
      customerIds.length
        ? supabase.from("crm_customers").select("id, first_name, last_name, company_name, email, phone").in("id", customerIds)
        : Promise.resolve({ data: [] as ListCustomer[] }),
      walletIds.length
        ? supabase
            .from("crm_billing_companies")
            .select("id, customer_id, company_name, funding, sort_order")
            .in("customer_id", walletIds)
        : Promise.resolve({ data: [] as (FundingCompany & { customer_id: string })[] }),
      loadStayMaps(
        supabase,
        shown.map((row) => row.id)
      ),
      loadDisplayedStayAmounts(supabase, shown),
    ]);
    const customersById = new Map(((customerRows || []) as ListCustomer[]).map((row) => [row.id, row]));
    const companiesByCustomer = new Map<string, (FundingCompany & { customer_id: string })[]>();
    for (const company of (companyRows || []) as (FundingCompany & { customer_id: string })[]) {
      const list = companiesByCustomer.get(company.customer_id) || [];
      list.push(company);
      companiesByCustomer.set(company.customer_id, list);
    }
    const payerLabels: Record<string, string> = {};
    for (const row of shown) {
      const label = bookingPayerLabel(row, companiesByCustomer.get(row.billing_customer_id || row.customer_id) || []);
      if (label) payerLabels[row.id] = label;
    }
    const names = new Map(
      [...customersById.entries()].map(([id, row]) => [id, customerFullName(row)])
    );

    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Réservations"
          subtitle="Enregistrez le dossier, puis montrez-le au client. Enregistrer ne le rend pas visible."
          actions={
            <Link href="/admin/reservations/nouveau" className="admin-af-btn admin-tap inline-flex items-center rounded-xl px-4 py-2.5 text-sm">
              + Nouveau dossier
            </Link>
          }
        />
        <div className="mt-6 space-y-3">
          <ReservationsViewToggle liste={false} listeHref={listeHref} />
          <BookingsFilters q="" etat={null} tri={sort} revision="semaine" />
          <ReservationWeek
            columns={columns}
            names={names}
            places={maps}
            amounts={displayed}
            payerLabels={payerLabels}
          />
        </div>
      </div>
    );
  }

  function applyFilters(query: FilterableQuery, archivedOnly: boolean) {
    let next = query;
    if (archivedOnly) next = next.not("archived_at", "is", null);
    else next = next.is("archived_at", null);
    if (!archivedOnly && state === "preparation") next = next.eq("visible_to_client", false);
    if (!archivedOnly && state === "montre") next = next.eq("visible_to_client", true);
    if (!archivedOnly && state === "a-venir") {
      next = next.gte("start_date", todayIsoDate()).neq("status", "cancelled");
    }
    return next;
  }

  const { from, to } = pageRange(page);
  const order = BOOKING_SORTS[sort];
  const listQuery = supabase.from("crm_bookings").select("*", { count: "exact" });
  // Au-delà, la recherche reste sur le tri demandé. Une agence tient largement en dessous.
  const SEARCH_SCAN = 400;
  const PROXIMITY_PAGE = 1000;

  function filtered(archivedOnly: boolean, withCount: boolean) {
    const query = withCount ? listQuery : supabase.from("crm_bookings").select("*");
    return applyFilters(query as unknown as FilterableQuery, archivedOnly) as unknown as typeof listQuery;
  }

  function ordered(archivedOnly: boolean, withCount: boolean) {
    const query = filtered(archivedOnly, withCount);
    if (order.proximity) {
      // Les plus anciennes dates sortent du plafond : elles sont en bas du tri proche.
      return query.order("start_date", { ascending: false, nullsFirst: false });
    }
    return query
      .order(order.column, { ascending: order.ascending, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  async function loadByProximity(archivedOnly: boolean) {
    const rows: CrmBooking[] = [];
    let count: number | null = null;
    let error: { code?: string; message?: string } | null = null;
    for (let offset = 0; offset < 10000; offset += PROXIMITY_PAGE) {
      const pageResult = await filtered(archivedOnly, offset === 0)
        .order("id", { ascending: true })
        .range(offset, offset + PROXIMITY_PAGE - 1);
      if (pageResult.error) {
        error = pageResult.error;
        break;
      }
      if (offset === 0) count = pageResult.count;
      const batch = (pageResult.data || []) as CrmBooking[];
      rows.push(...batch);
      if (batch.length < PROXIMITY_PAGE) break;
    }
    return {
      scanned: sortBookingsByProximity(rows, today),
      archived: [] as CrmBooking[],
      count: count ?? rows.length,
      error,
    };
  }

  const listResult = q
    ? await (async () => {
        const [main, archived] = await Promise.all([
          ordered(state === "archive", false).limit(SEARCH_SCAN),
          state === "archive"
            ? Promise.resolve({ data: [] as CrmBooking[] | null, error: null })
            : ordered(true, false).limit(SEARCH_SCAN),
        ]);
        return {
          scanned: (main.data || []) as CrmBooking[],
          archived: (archived.data || []) as CrmBooking[],
          count: null as number | null,
          error: main.error || archived.error,
        };
      })()
    : order.proximity
      ? await loadByProximity(state === "archive")
      : await (async () => {
          const main = await ordered(state === "archive", true).range(from, to);
          return {
            scanned: (main.data || []) as CrmBooking[],
            archived: [] as CrmBooking[],
            count: main.count,
            error: main.error,
          };
        })();
  // Lecture en échec : la page d’erreur (« Réessayer ») plutôt qu’un faux « Aucune réservation trouvée ».
  if (listResult.error) {
    console.error("[admin/reservations]", listResult.error.code ?? "?", listResult.error.message ?? "");
    throw new Error("Réservations indisponibles");
  }
  const pool = q ? [...listResult.scanned, ...listResult.archived] : listResult.scanned;
  const customerIds = [...new Set(pool.map((row) => row.customer_id).filter(Boolean))];
  const walletIds = [
    ...new Set(pool.flatMap((row) => [row.billing_customer_id, row.customer_id].filter(Boolean))),
  ];
  const [{ data: customerRows }, { data: companyRows }, maps, displayed] = await Promise.all([
    customerIds.length
      ? supabase
          .from("crm_customers")
          .select("id, first_name, last_name, company_name, email, phone")
          .in("id", customerIds)
      : Promise.resolve({ data: [] as ListCustomer[] }),
    walletIds.length
      ? supabase
          .from("crm_billing_companies")
          .select("id, customer_id, company_name, funding, sort_order")
          .in("customer_id", walletIds)
      : Promise.resolve({ data: [] as (FundingCompany & { customer_id: string })[] }),
    loadStayMaps(
      supabase,
      pool.map((row) => row.id)
    ),
    loadDisplayedStayAmounts(supabase, pool),
  ]);
  const customersById = new Map(((customerRows || []) as ListCustomer[]).map((row) => [row.id, row]));
  const companiesByCustomer = new Map<string, (FundingCompany & { customer_id: string })[]>();
  for (const company of (companyRows || []) as (FundingCompany & { customer_id: string })[]) {
    const list = companiesByCustomer.get(company.customer_id) || [];
    list.push(company);
    companiesByCustomer.set(company.customer_id, list);
  }
  const payerLabels: Record<string, string> = {};
  for (const row of pool) {
    const label = bookingPayerLabel(
      row,
      companiesByCustomer.get(row.billing_customer_id || row.customer_id) || []
    );
    if (label) payerLabels[row.id] = label;
  }
  const searchText = new Map<string, string>();
  for (const row of pool) {
    const customer = customersById.get(row.customer_id);
    searchText.set(
      row.id,
      bookingListSearchText({
        reference: row.reference,
        title: row.title,
        destination: row.destination,
        status: row.status,
        start_date: row.start_date,
        end_date: row.end_date,
        archived_at: row.archived_at,
        visible_to_client: row.visible_to_client,
        currency: row.currency,
        customer: customer ? customerFullName(customer) : "",
        company: [customer?.company_name, payerLabels[row.id]].filter(Boolean).join(" "),
        email: customer?.email,
        phone: customer?.phone,
        places: maps.arrival[row.id],
        routes: maps.route[row.id],
        layovers: maps.layovers[row.id],
        amount: displayed.get(row.id) ?? Number(row.total_amount),
      })
    );
  }
  const matchedRaw = q
    ? listResult.scanned.filter((row) => smartSearchMatch(q, searchText.get(row.id)))
    : listResult.scanned;
  const matched = q && order.proximity ? sortBookingsByProximity(matchedRaw, today) : matchedRaw;
  const total = q ? matched.length : (listResult.count ?? matched.length);
  // `?page=999` : on renvoie sur la dernière page plutôt qu’un résumé « 301-312 » au-dessus d’une liste vide.
  const lastPage = pageOverflow(page, total);
  if (lastPage != null) {
    redirect(listHref("/admin/reservations", { q, etat: state, tri: bookingSortParam(sort) }, lastPage));
  }
  const rows = q || order.proximity ? matched.slice(from, to + 1) : matched;
  const hiddenArchiveHits =
    q && state !== "archive"
      ? listResult.archived.filter((row) => smartSearchMatch(q, searchText.get(row.id))).length
      : 0;
  const rowIds = new Set(rows.map((row) => row.id));
  const customers = [...customersById.values()].filter((row) => rows.some((booking) => booking.customer_id === row.id));
  const visibleSearch: Record<string, string> = {};
  const displayAmounts: Record<string, number> = {};
  for (const id of rowIds) {
    visibleSearch[id] = searchText.get(id) || "";
    const amount = displayed.get(id);
    if (amount != null) displayAmounts[id] = amount;
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Réservations"
        subtitle="Enregistrez le dossier, puis montrez-le au client. Enregistrer ne le rend pas visible."
        actions={
          <Link href="/admin/reservations/nouveau" className="admin-af-btn admin-tap inline-flex items-center rounded-xl px-4 py-2.5 text-sm">
            + Nouveau dossier
          </Link>
        }
      />
      <div className="mt-6 space-y-3">
        <ReservationsViewToggle liste listeHref={listeHref} />
        <BookingsTable
          bookings={rows}
          customers={customers.map((row) => ({ id: row.id, first_name: row.first_name, last_name: row.last_name }))}
          places={pickRecord(maps.arrival, rowIds)}
          routes={pickRecord(maps.route, rowIds)}
          layovers={pickRecord(maps.layovers, rowIds)}
          displayAmounts={displayAmounts}
          searchText={visibleSearch}
          payerLabels={payerLabels}
          page={page}
          pageSize={ADMIN_PAGE_SIZE}
          total={total}
          filters={{ q, etat: state, tri: sort, vue }}
          hiddenArchiveHits={hiddenArchiveHits}
        />
      </div>
    </div>
  );
}
