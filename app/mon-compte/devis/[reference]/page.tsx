import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { QuoteDecision } from "@/components/account/QuoteDecision";
import type { CrmQuote, CrmQuoteLine } from "@/lib/crm/types";

type Props = { params: Promise<{ reference: string }> };
type QuoteWithLines = CrmQuote & { crm_quote_lines: CrmQuoteLine[] };

export default async function QuoteDetailPage({ params }: Props) {
  const { reference } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?next=/mon-compte/devis/${encodeURIComponent(reference)}`);
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  const { data } = await supabase
    .from("crm_quotes")
    .select("*, crm_quote_lines(*)")
    .eq("reference", reference)
    .eq("customer_id", customer.id)
    .neq("status", "draft")
    .maybeSingle();
  if (!data) notFound();
  const quote = data as QuoteWithLines;
  const lines = [...quote.crm_quote_lines].sort((a, b) => a.sort_order - b.sort_order);
  const total = lines
    .filter((line) => !line.optional || line.selected)
    .reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price) * (1 + Number(line.tax_rate) / 100), 0);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">{quote.reference} · version {quote.version}</p>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{quote.title}</h1>
        <p className="mt-1 text-sm text-muted">Valable jusqu’au {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString("fr-FR") : "sans date limite"}</p>
        <a href={`/api/client/quotes/${quote.id}/pdf`} className="mt-3 inline-flex rounded-full border border-border bg-white px-4 py-2 text-xs font-bold">
          Télécharger le devis PDF
        </a>
      </header>
      <section className="account-card overflow-hidden">
        <div className="divide-y divide-border">
          {lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">{line.title}</p>
                {line.description ? <p className="text-sm text-muted">{line.description}</p> : null}
                {line.optional ? <p className="text-xs text-[var(--aura-blue)]">Option {line.selected ? "retenue" : "non retenue"}</p> : null}
              </div>
              <p className="shrink-0 font-semibold">{(Number(line.quantity) * Number(line.unit_price)).toLocaleString("fr-FR", { style: "currency", currency: quote.currency })}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between bg-[var(--aura-blue-soft)] p-5 font-display text-xl font-bold text-[var(--admin-navy)]">
          <span>Total TTC</span>
          <span>{total.toLocaleString("fr-FR", { style: "currency", currency: quote.currency })}</span>
        </div>
      </section>
      {quote.terms ? <section className="account-card p-5"><h2 className="font-bold">Conditions</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{quote.terms}</p></section> : null}
      {quote.status === "sent" ? (
        <QuoteDecision
          quoteId={quote.id}
          currency={quote.currency}
          optionalLines={lines
            .filter((line) => line.optional)
            .map((line) => ({
              id: line.id,
              title: line.title,
              selected: line.selected,
              amount:
                Number(line.quantity) *
                Number(line.unit_price) *
                (1 + Number(line.tax_rate) / 100),
            }))}
        />
      ) : (
        <div className="account-card p-5 text-sm">
          Statut : <strong>{quote.status === "accepted" ? "Accepté" : quote.status === "declined" ? "Refusé" : quote.status}</strong>
          {quote.accepted_at ? ` le ${new Date(quote.accepted_at).toLocaleString("fr-FR")}` : ""}
          {quote.acceptance_name ? ` par ${quote.acceptance_name}` : ""}
        </div>
      )}
    </div>
  );
}
