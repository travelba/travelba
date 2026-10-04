import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { BookingsTable } from "@/components/admin/BookingsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadStayMaps } from "@/lib/crm/carnet-query";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";
import type { CrmBooking } from "@/lib/crm/types";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";
import {
  ADMIN_PAGE_SIZE,
  BOOKING_SORTS,
  firstParam,
  orSearchFilter,
  pageRange,
  parseBookingSort,
  parseBookingState,
  parseBookingStatus,
  parsePage,
  searchPattern,
  type FilterableQuery,
  type SearchParamValue,
} from "@/lib/crm/admin-list";

type Props = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

export default async function AdminReservationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const q = (firstParam(params.q) || "").trim();
  const state = parseBookingState(params.etat);
  const status = parseBookingStatus(params.statut);
  const sort = parseBookingSort(params.tri);
  const pattern = searchPattern(q);
  const { supabase } = await requireStaffPage();

  // Les dossiers d’un client cherché par son nom : quelques ids, pas la table.
  let matchedCustomerIds: string[] = [];
  if (pattern) {
    const { data: matched } = await supabase
      .from("crm_customers")
      .select("id")
      .or(orSearchFilter(pattern, ["first_name", "last_name", "company_name"]))
      .limit(50);
    matchedCustomerIds = ((matched || []) as { id: string }[]).map((row) => row.id);
  }

  function applyFilters(query: FilterableQuery, archivedOnly: boolean) {
    let next = query;
    if (archivedOnly) next = next.not("archived_at", "is", null);
    else next = next.is("archived_at", null);
    if (!archivedOnly && state === "preparation") next = next.eq("visible_to_client", false);
    if (!archivedOnly && state === "montre") next = next.eq("visible_to_client", true);
    if (status) next = next.eq("status", status);
    if (pattern) {
      next = next.or(orSearchFilter(pattern, ["reference", "title", "destination"], "customer_id", matchedCustomerIds));
    }
    return next;
  }

  const { from, to } = pageRange(page);
  const order = BOOKING_SORTS[sort];
  const listQuery = supabase.from("crm_bookings").select("*", { count: "exact" });
  const archivedCountQuery = supabase.from("crm_bookings").select("id", { count: "exact", head: true });
  const [{ data: bookings, count }, { data: companies }, hiddenArchived] = await Promise.all([
    (applyFilters(listQuery as unknown as FilterableQuery, state === "archive") as unknown as typeof listQuery)
      .order(order.column, { ascending: order.ascending, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.from("crm_billing_companies").select("id, customer_id, company_name, sort_order").order("sort_order"),
    pattern && state !== "archive"
      ? (applyFilters(archivedCountQuery as unknown as FilterableQuery, true) as unknown as typeof archivedCountQuery)
      : Promise.resolve({ count: 0 }),
  ]);
  const rows = (bookings || []) as CrmBooking[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
  const [{ data: customers }, maps, displayed] = await Promise.all([
    customerIds.length
      ? supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", customerIds)
      : Promise.resolve({ data: [] as CustomerNameRow[] }),
    loadStayMaps(
      supabase,
      rows.map((row) => row.id)
    ),
    loadDisplayedStayAmounts(supabase, rows),
  ]);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Réservations"
        subtitle="Enregistrez le dossier, puis montrez-le au client. Enregistrer ne le rend pas visible."
      />
      <div className="mt-6">
        <NewBookingForm
          companies={(companies || []) as {
            id: string;
            customer_id: string;
            company_name: string | null;
            sort_order: number;
          }[]}
          aiConfigured={aiGatewayConfigured()}
        />
      </div>
      <BookingsTable
        bookings={rows}
        customers={(customers || []) as CustomerNameRow[]}
        places={maps.arrival}
        routes={maps.route}
        displayAmounts={Object.fromEntries(displayed)}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={count ?? rows.length}
        filters={{ q, etat: state, statut: status, tri: sort }}
        hiddenArchiveHits={hiddenArchived.count ?? 0}
      />
    </div>
  );
}
