import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmQuote, CrmQuoteLine } from "@/lib/crm/types";

type QuoteWithLines = CrmQuote & { crm_quote_lines: CrmQuoteLine[] };

export default async function QuotesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/devis");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");

  const { data } = await supabase
    .from("crm_quotes")
    .select("*, crm_quote_lines(*)")
    .eq("customer_id", customer.id)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  const quotes = (data || []) as QuoteWithLines[];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Propositions</p>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Mes devis</h1>
      </div>
      <div className="grid gap-3">
        {quotes.length ? quotes.map((quote) => {
          const total = quote.crm_quote_lines
            .filter((line) => !line.optional || line.selected)
            .reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price) * (1 + Number(line.tax_rate) / 100), 0);
          return (
            <Link key={quote.id} href={`/mon-compte/devis/${quote.reference}`} className="account-card flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{quote.title}</p>
                <p className="text-sm text-muted">{quote.reference} · version {quote.version}</p>
                <p className="mt-1 text-xs font-semibold uppercase text-[var(--aura-blue)]">{quote.status}</p>
              </div>
              <p className="font-display text-xl font-bold">{total.toLocaleString("fr-FR", { style: "currency", currency: quote.currency })}</p>
            </Link>
          );
        }) : <div className="account-card p-8 text-center text-sm text-muted">Aucun devis disponible.</div>}
      </div>
    </div>
  );
}
