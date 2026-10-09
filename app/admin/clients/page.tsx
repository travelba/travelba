import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, type CrmBalance, type CrmTravelDocument } from "@/lib/crm/types";
import { CUSTOMER_LIST_SELECT, CUSTOMER_NAME_SELECT, type CustomerListRow, type CustomerNameRow } from "@/lib/crm/customer-search";
import { formatDateFr, isoDateInDays } from "@/lib/crm/money";
import {
  ADMIN_PAGE_SIZE,
  firstParam,
  joinOrFilters,
  listHref,
  orSearchFilter,
  pageOverflow,
  pageRange,
  parseClientFilter,
  phoneSearchFilter,
  parsePage,
  searchPattern,
  type SearchParamValue,
} from "@/lib/crm/admin-list";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const params = await searchParams;
  return { title: firstParam(params.pieces) === "echeance" ? "Pièces à échéance" : "Clients" };
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const params = await searchParams;
  const q = (firstParam(params.q) || "").trim();
  const page = parsePage(params.page);
  const filter = parseClientFilter(params.filtre);
  const pattern = searchPattern(q);
  const { supabase } = await requireStaffPage();
  const expiryOnly = firstParam(params.pieces) === "echeance";
  if (expiryOnly) {
    const { data } = await supabase
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on")
      .not("expires_on", "is", null)
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on")
      .limit(200);
    const listed = (data || []) as CrmTravelDocument[];
    const today = isoDateInDays(0);
    const upcoming = listed.filter((doc) => (doc.expires_on || "") >= today);
    const expired = listed.filter((doc) => (doc.expires_on || "") < today);
    const ownerIds = [...new Set(listed.map((doc) => doc.customer_id).filter(Boolean))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", ownerIds)
      : { data: [] as CustomerNameRow[] };
    const ownerById = new Map(((owners || []) as CustomerNameRow[]).map((row) => [row.id, row]));
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Pièces à échéance"
          subtitle="Déjà expirées, puis celles qui expirent dans les 90 jours. Le nom ouvre la fiche."
          actions={
            <Link href="/admin/clients" className="text-sm font-semibold text-[var(--admin-navy)] underline">
              Tous les clients
            </Link>
          }
        />
        <section className="admin-af-card mt-6 overflow-hidden rounded-2xl">
          <ul className="divide-y divide-border text-sm">
            <li className="bg-[var(--admin-sky)]/50 px-5 py-2 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Déjà expirées
            </li>
            {expired.map((doc) => {
              const owner = ownerById.get(doc.customer_id);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/admin/clients/${doc.customer_id}`} className="font-semibold text-[var(--admin-navy)]">
                    {doc.doc_type} · {owner ? customerFullName(owner) : "Client"}
                  </Link>
                  <span className="font-semibold text-[var(--admin-red)]">{formatDateFr(doc.expires_on)}</span>
                </li>
              );
            })}
            {!expired.length ? <li className="px-5 py-4 text-muted">Aucune pièce déjà expirée.</li> : null}
            <li className="bg-[var(--admin-sky)]/50 px-5 py-2 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Dans les 90 jours
            </li>
            {upcoming.map((doc) => {
              const owner = ownerById.get(doc.customer_id);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/admin/clients/${doc.customer_id}`} className="font-semibold text-[var(--admin-navy)]">
                    {doc.doc_type} · {owner ? customerFullName(owner) : "Client"}
                  </Link>
                  <span className="font-semibold text-[var(--admin-red)]">{formatDateFr(doc.expires_on)}</span>
                </li>
              );
            })}
            {!upcoming.length ? <li className="px-5 py-4 text-muted">Aucune pièce dans les 90 jours.</li> : null}
          </ul>
        </section>
      </div>
    );
  }

  const { from, to } = pageRange(page);
  let query = supabase.from("crm_customers").select(CUSTOMER_LIST_SELECT, { count: "exact" });
  if (filter === "veille") query = query.eq("on_hold", true);
  if (pattern) {
    // Nom, société, e-mail en `ilike` ; un numéro tapé « 06 12 34 » retrouve aussi le `+33612…` stocké.
    query = query.or(
      joinOrFilters(
        orSearchFilter(pattern, ["first_name", "last_name", "usage_name", "company_name", "email", "phone"]),
        phoneSearchFilter(q)
      )
    );
  }
  const { data: customers, error: customersError, count } = await query
    .order("last_name")
    .order("first_name")
    .range(from, to);
  if (customersError) {
    console.error("[admin/clients]", customersError.code ?? "?", customersError.message ?? "");
  }
  const lastPage = pageOverflow(page, count);
  if (lastPage != null) redirect(listHref("/admin/clients", { q, filtre: filter }, lastPage));
  const rows = (customers || []) as CustomerListRow[];
  const { data: balances } = rows.length
    ? await supabase
        .from("crm_customer_balances")
        .select("*")
        .in(
          "customer_id",
          rows.map((row) => row.id)
        )
    : { data: [] as CrmBalance[] };

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Clients"
        subtitle="Fiches, invitation du titulaire, encours. Sans téléphone, le client le renseigne dans Vous au premier accès."
      />
      <div className="mt-6">
        <NewCustomerForm />
      </div>
      {customersError ? (
        <p className="mt-4 rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          Impossible de charger les fiches clients. Réessayez.
        </p>
      ) : null}
      <ClientsTable
        customers={rows}
        balances={(balances || []) as CrmBalance[]}
        query={q}
        filter={filter}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={count ?? rows.length}
      />
    </div>
  );
}
