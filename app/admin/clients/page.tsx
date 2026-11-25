import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { ClientsFilters } from "@/components/admin/ClientsFilters";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, DOC_TYPE_LABELS, type CrmBalance, type CrmTravelDocument } from "@/lib/crm/types";
import { CUSTOMER_LIST_SELECT, CUSTOMER_NAME_SELECT, type CustomerListRow, type CustomerNameRow } from "@/lib/crm/customer-search";
import { customerSearchBlob, sortByDirectoryRank } from "@/lib/crm/directory-search";
import { formatDateFr, isoDateInDays } from "@/lib/crm/money";
import {
  ADMIN_PAGE_SIZE,
  firstParam,
  listHref,
  pageOverflow,
  pageRange,
  parseClientFilter,
  parsePage,
  type SearchParamValue,
} from "@/lib/crm/admin-list";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const params = await searchParams;
  const expiry = firstParam(params.pieces) === "echeance" || parseClientFilter(params.filtre) === "echeance";
  return { title: expiry ? "Clients · Pièces à échéance" : "Clients" };
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
  // Ancien lien `?pieces=echeance` : la même vue, en filtre de la liste.
  if (firstParam(params.pieces) === "echeance") redirect(listHref("/admin/clients", { q: q || null, filtre: "echeance" }));
  const { supabase } = await requireStaffPage();
  console.time("[clients] vague 1");
  if (filter === "echeance") {
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
    console.timeEnd("[clients] vague 1");
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Clients"
          subtitle="Pièces à échéance : déjà expirées, puis celles qui expirent dans les 90 jours. Le nom ouvre la fiche."
        />
        <div className="mt-6">
          <ClientsFilters q="" filtre={filter} revision="echeance" />
        </div>
        <section className="admin-af-card mt-4 overflow-hidden rounded-2xl">
          <ul className="divide-y divide-border text-sm">
            <li className="bg-[var(--admin-sky)]/50 px-5 py-2 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Déjà expirées
            </li>
            {expired.map((doc) => {
              const owner = ownerById.get(doc.customer_id);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/admin/clients/${doc.customer_id}`} prefetch={false} className="font-semibold text-[var(--admin-navy)]">
                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} · {owner ? customerFullName(owner) : "Client"}
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
                  <Link href={`/admin/clients/${doc.customer_id}`} prefetch={false} className="font-semibold text-[var(--admin-navy)]">
                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} · {owner ? customerFullName(owner) : "Client"}
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
  let rows: CustomerListRow[] = [];
  let count: number | null = null;
  let customersError: { code?: string; message?: string } | null = null;
  if (q) {
    const [listed, companies, companions] = await Promise.all([
      supabase.from("crm_customers").select(`${CUSTOMER_LIST_SELECT}, phone_secondary`).limit(2000),
      supabase.from("crm_billing_companies").select("customer_id, company_name").limit(2000),
      supabase.from("crm_travel_companions").select("customer_id, first_name, last_name, usage_name").limit(2000),
    ]);
    customersError = listed.error || companies.error || companions.error;
    const companyNames = new Map<string, string[]>();
    for (const company of (companies.data || []) as { customer_id: string; company_name: string | null }[]) {
      const name = (company.company_name || "").trim();
      if (!name) continue;
      const list = companyNames.get(company.customer_id) || [];
      list.push(name);
      companyNames.set(company.customer_id, list);
    }
    const people = new Map<string, string[]>();
    for (const person of (companions.data || []) as {
      customer_id: string;
      first_name: string | null;
      last_name: string | null;
      usage_name: string | null;
    }[]) {
      const name = [person.first_name, person.last_name, person.usage_name].filter(Boolean).join(" ");
      if (!name) continue;
      const list = people.get(person.customer_id) || [];
      list.push(name);
      people.set(person.customer_id, list);
    }
    let pool = (listed.data || []) as (CustomerListRow & { phone_secondary?: string | null })[];
    if (filter === "veille") pool = pool.filter((row) => row.on_hold);
    const ranked = sortByDirectoryRank(pool, q, (row) =>
      customerSearchBlob({
        ...row,
        companies: companyNames.get(row.id),
        people: people.get(row.id),
        phone_secondary: row.phone_secondary,
      })
    );
    count = ranked.length;
    rows = ranked.slice(from, to + 1);
  } else {
    let query = supabase.from("crm_customers").select(CUSTOMER_LIST_SELECT, { count: "exact" });
    if (filter === "veille") query = query.eq("on_hold", true);
    const listed = await query
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to);
    customersError = listed.error;
    count = listed.count;
    rows = (listed.data || []) as CustomerListRow[];
  }
  if (customersError) {
    console.error("[admin/clients]", customersError.code ?? "?", customersError.message ?? "");
  }
  const lastPage = pageOverflow(page, count);
  if (lastPage != null) redirect(listHref("/admin/clients", { q, filtre: filter }, lastPage));
  const { data: balances } = rows.length
    ? await supabase
        .from("crm_customer_balances")
        .select("customer_id, balance, currency")
        .in(
          "customer_id",
          rows.map((row) => row.id)
        )
    : { data: [] as CrmBalance[] };
  console.timeEnd("[clients] vague 1");

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
