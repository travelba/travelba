import Link from "next/link";
import { ClientsFilters } from "@/components/admin/ClientsFilters";
import { Pagination } from "@/components/admin/Pagination";
import type { CrmBalance } from "@/lib/crm/types";
import { customerFullName } from "@/lib/crm/types";
import type { CustomerListRow } from "@/lib/crm/customer-search";
import { clientLedgerAdminHref } from "@/lib/crm/client-ledger";
import { formatCreditDisponible, formatMoney } from "@/lib/crm/money";
import { formatPhoneDisplay } from "@/lib/crm/phone";
import { ADMIN_PAGE_SIZE, listHref, type ClientFilter } from "@/lib/crm/admin-list";

function clientSearchText(c: CustomerListRow) {
  const phone = c.phone || "";
  const digits = phone.replace(/\D/g, "");
  const national = digits.startsWith("33") && digits.length > 2 ? `0${digits.slice(2)}` : "";
  return [customerFullName(c), c.usage_name, c.company_name, c.email, phone, digits, national]
    .filter(Boolean)
    .join(" ");
}

function initials(c: CustomerListRow) {
  return [c.first_name?.[0], c.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

/** Liste paginée côté serveur : la recherche met l’URL à jour pendant la saisie. */
export function ClientsTable({
  customers,
  balances,
  query = "",
  filter = null,
  page = 1,
  pageSize = ADMIN_PAGE_SIZE,
  total = customers.length,
}: {
  customers: CustomerListRow[];
  balances: CrmBalance[];
  query?: string;
  filter?: ClientFilter | null;
  page?: number;
  pageSize?: number;
  total?: number;
}) {
  const bal = new Map<string, CrmBalance[]>();
  for (const row of balances) {
    const list = bal.get(row.customer_id) || [];
    list.push(row);
    bal.set(row.customer_id, list);
  }
  const filtered = customers;
  const urlFilters = { q: query, filtre: filter };
  const hrefFor = (next: number) => listHref("/admin/clients", urlFilters, next);

  return (
    <div className="mt-6 space-y-3">
      <ClientsFilters q={query} filtre={filter} revision={customers.map((c) => c.id).join(",")} />
      <Pagination page={page} pageSize={pageSize} total={total} label={total > 1 ? "clients" : "client"} hrefFor={hrefFor} />
      <div id="clients-liste" className="admin-af-card max-w-full overflow-hidden rounded-2xl">
        <ul className="divide-y divide-border lg:hidden">
          {filtered.map((c) => {
            const rows = bal.get(c.id) || [];
            const amount = rows[0];
            const value = amount ? Number(amount.balance) : 0;
            return (
              <li key={c.id} data-search={clientSearchText(c)} className="space-y-2 px-4 py-4">
                <Link href={`/admin/clients/${c.id}`} className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[#f8f6f0]">
                    {initials(c)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--admin-navy)]">{customerFullName(c)}</span>
                    {c.on_hold ? (
                      <span className="mt-0.5 inline-flex rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)]">
                        En veille
                      </span>
                    ) : null}
                  </span>
                </Link>
                <p className="break-all text-sm text-muted">{c.email}</p>
                <p className="text-sm text-muted">{c.phone ? formatPhoneDisplay(c.phone) : "—"}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {rows.length ? (
                    <Link
                      href={clientLedgerAdminHref(c.id)}
                      className={`text-sm font-semibold underline-offset-2 hover:underline ${
                        value < 0 ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]"
                      }`}
                    >
                      {value > 0
                        ? rows.map((b) => formatCreditDisponible(Number(b.balance), b.currency)).join(" · ")
                        : rows.map((b) => formatMoney(Number(b.balance), b.currency)).join(" · ")}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">—</span>
                  )}
                </div>
              </li>
            );
          })}
          <li data-search-empty hidden className="px-4 py-8 text-center text-sm text-muted">
            Aucun client trouvé.
          </li>
          {!filtered.length ? (
            <li className="px-4 py-8 text-center text-sm text-muted">
              {total === 0 && !query && !filter
                ? "Aucun client. Créez une fiche titulaire puis invitez — pas de client fictif."
                : "Aucun client trouvé."}
            </li>
          ) : null}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Téléphone</th>
                <th className="px-5 py-3 text-right">Crédit dispo. / encours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const rows = bal.get(c.id) || [];
                const amount = rows[0];
                const value = amount ? Number(amount.balance) : 0;
                return (
                  <tr key={c.id} data-search={clientSearchText(c)} className="transition hover:bg-[var(--admin-sky)]/40">
                    <td className="px-5 py-3">
                      <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[#f8f6f0]">
                          {initials(c)}
                        </span>
                        <span className="flex flex-col">
                          <span className="font-semibold text-[var(--admin-navy)]">{customerFullName(c)}</span>
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {c.on_hold ? (
                              <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)]">
                                En veille
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.email}</td>
                    <td className="px-5 py-3 text-muted">{c.phone ? formatPhoneDisplay(c.phone) : "—"}</td>
                    <td
                      className={`px-5 py-3 text-right font-semibold ${
                        value < 0 ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]"
                      }`}
                    >
                      {rows.length ? (
                        <Link
                          href={clientLedgerAdminHref(c.id)}
                          className="inline-flex flex-col items-end gap-0.5 underline-offset-2 hover:underline"
                        >
                          <span>
                            {value > 0
                              ? rows
                                  .map((b) =>
                                    formatCreditDisponible(Number(b.balance), b.currency)
                                  )
                                  .join(" · ")
                              : rows
                                  .map((b) => formatMoney(Number(b.balance), b.currency))
                                  .join(" · ")}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr data-search-empty hidden>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  Aucun client trouvé.
                </td>
              </tr>
              {!filtered.length ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted">
                    {total === 0 && !query && !filter
                      ? "Aucun client. Créez une fiche titulaire puis invitez — pas de client fictif."
                      : "Aucun client trouvé."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {total > pageSize ? (
        <Pagination page={page} pageSize={pageSize} total={total} label={total > 1 ? "clients" : "client"} hrefFor={hrefFor} />
      ) : null}
    </div>
  );
}
