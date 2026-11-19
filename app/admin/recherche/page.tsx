import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { pickSearchHref } from "@/lib/crm/admin-search";
import { AdminSearchField } from "@/components/admin/AdminSearchField";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { loadOmnibar, OMNIBAR_GROUPS, withOmnibarCharge } from "@/lib/crm/omnibar";

export const metadata = { title: "Recherche" };

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const { supabase } = await requireStaffPage();
  if (!query) {
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Recherche" subtitle="Un nom, une société, un téléphone ou une référence." />
        <AdminSearchField />
      </div>
    );
  }

  const ranked = await withOmnibarCharge(supabase, await loadOmnibar(supabase, query, 20));
  const href = pickSearchHref(query, { bookings: ranked.dossiers, customers: ranked.clients });
  if (href) redirect(href);
  const groups = OMNIBAR_GROUPS.map((group) => ({ ...group, rows: ranked[group.id] })).filter((group) => group.rows.length);

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Recherche" subtitle={`« ${query} »`} />
      <AdminSearchField initial={query} />
      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <section key={group.id} className="admin-af-card overflow-hidden rounded-2xl">
            <h2 className="border-b border-border px-5 py-4 font-display text-lg font-bold">{group.label}</h2>
            <ul className="divide-y divide-border text-sm">
              {group.rows.map((row) => (
                <li key={`${group.id}-${row.id}`}>
                  <Link href={row.href} className="block px-5 py-3 text-[var(--admin-navy)]">
                    <span className="block font-semibold">{row.title}</span>
                    {row.subtitle ? <span className="mt-0.5 block text-xs text-muted">{row.subtitle}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length ? <p className="text-sm text-muted">Aucun client, dossier ni voyageur pour cette recherche.</p> : null}
      </div>
    </div>
  );
}
