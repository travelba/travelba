import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, type CrmBalance, type CrmTravelDocument } from "@/lib/crm/types";
import { CUSTOMER_LIST_SELECT, CUSTOMER_NAME_SELECT, type CustomerListRow, type CustomerNameRow } from "@/lib/crm/customer-search";
import { formatDateFr, isoDateInDays } from "@/lib/crm/money";
import {
  ADMIN_PAGE_SIZE,
  firstParam,
  orSearchFilter,
  pageRange,
  parseClientFilter,
  parsePage,
  searchPattern,
  type SearchParamValue,
} from "@/lib/crm/admin-list";

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
    const expiring = (data || []) as CrmTravelDocument[];
    const ownerIds = [...new Set(expiring.map((doc) => doc.customer_id).filter(Boolean))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", ownerIds)
      : { data: [] as CustomerNameRow[] };
    const ownerById = new Map(((owners || []) as CustomerNameRow[]).map((row) => [row.id, row]));
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Pièces à échéance"
          subtitle="Passeports et pièces qui expirent dans les 90 jours. Le nom ouvre la fiche."
          actions={
            <Link href="/admin/clients" className="text-sm font-semibold text-[var(--admin-navy)] underline">
              Tous les clients
            </Link>
          }
        />
        <section className="admin-af-card mt-6 overflow-hidden rounded-2xl">
          <ul className="divide-y divide-border text-sm">
            {expiring.map((doc) => {
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
            {!expiring.length ? <li className="px-5 py-8 text-center text-muted">Aucune pièce dans les 90 jours.</li> : null}
          </ul>
        </section>
      </div>
    );
  }

  const { from, to } = pageRange(page);
  let query = supabase.from("crm_customers").select(CUSTOMER_LIST_SELECT, { count: "exact" });
  if (filter === "veille") query = query.eq("on_hold", true);
  if (pattern) query = query.or(orSearchFilter(pattern, ["first_name", "last_name", "usage_name", "company_name", "email", "phone"]));
  const { data: customers, error: customersError, count } = await query
    .order("last_name")
    .order("first_name")
    .range(from, to);
  if (customersError) {
    console.error("[admin/clients]", customersError.code ?? "?", customersError.message ?? "");
  }
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
