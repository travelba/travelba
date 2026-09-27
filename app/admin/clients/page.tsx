import { NewCustomerForm } from "@/components/admin/NewCustomerForm";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerFullName, type CrmBalance, type CrmCustomer, type CrmTravelDocument } from "@/lib/crm/types";
import { formatDateFr, isoDateInDays } from "@/lib/crm/money";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pieces?: string }>;
}) {
  const { q, pieces } = await searchParams;
  const { supabase } = await requireStaffPage();
  const expiryOnly = pieces === "echeance";
  let expiring: CrmTravelDocument[] = [];
  if (expiryOnly) {
    const { data } = await supabase
      .from("crm_travel_documents")
      .select("id, customer_id, doc_type, expires_on")
      .not("expires_on", "is", null)
      .lte("expires_on", isoDateInDays(90))
      .order("expires_on");
    expiring = (data || []) as CrmTravelDocument[];
  }
  const [{ data: customers, error: customersError }, { data: balances }] = await Promise.all([
    supabase.from("crm_customers").select("*").order("last_name"),
    supabase.from("crm_customer_balances").select("*"),
  ]);
  if (customersError) {
    console.error("[admin/clients]", customersError.code ?? "?", customersError.message ?? "");
  }

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
      {expiryOnly ? (
        <section className="admin-af-card mt-6 overflow-hidden rounded-2xl">
          <h2 className="border-b border-border px-5 py-4 font-display text-lg font-bold text-[var(--admin-navy)]">
            Pièces à échéance
          </h2>
          <ul className="divide-y divide-border text-sm">
            {expiring.map((doc) => {
              const owner = ((customers || []) as CrmCustomer[]).find((row) => row.id === doc.customer_id);
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
      ) : (
        <ClientsTable
          customers={(customers || []) as CrmCustomer[]}
          balances={(balances || []) as CrmBalance[]}
          initialQuery={q || ""}
        />
      )}
    </div>
  );
}
