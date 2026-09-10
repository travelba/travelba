import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Montserrat, Source_Sans_3 } from "next/font/google";
import {
  fetchPublicVoyageQuote,
  KIND_LABELS,
  sumQuoteLines,
} from "@/lib/agency/public-quote";
import { siteConfig } from "@/lib/site";

const display = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-admin-display",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-admin-sans",
});

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const quote = await fetchPublicVoyageQuote(token);
  return {
    title: quote
      ? `Devis — ${quote.title} | ${siteConfig.shortName}`
      : `Devis | ${siteConfig.shortName}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicDevisPage({ params }: Props) {
  const { token } = await params;
  const quote = await fetchPublicVoyageQuote(token);
  if (!quote) notFound();

  const totals = sumQuoteLines(quote.quote_lines);
  const clientName = [quote.client_first_name, quote.client_last_name]
    .filter(Boolean)
    .join(" ");
  const updated = new Date(quote.updated_at).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      className={`admin-af min-h-screen ${display.variable} ${sans.variable}`}
    >
      <header className="admin-af-header">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="font-display text-lg font-extrabold uppercase tracking-wide text-[var(--admin-navy)]">
              {siteConfig.shortName}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Suivi devis
            </p>
          </div>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            className="admin-af-btn rounded-full px-4 py-2 text-xs"
          >
            Contacter l’agence
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="admin-af-hero-band relative overflow-hidden rounded-3xl px-6 py-8 sm:px-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 90% 10%, rgba(232,25,50,0.4), transparent 40%)",
            }}
          />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
              Votre voyage
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold text-white sm:text-4xl">
              {quote.title}
            </h1>
            <p className="mt-3 text-sm text-white/80">
              {clientName ? `${clientName} · ` : ""}
              {quote.start_date && quote.end_date
                ? `${quote.start_date} → ${quote.end_date}`
                : "Dates à confirmer"}
            </p>
          </div>
        </section>

        <section className="admin-af-card mt-6 rounded-3xl p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">
                Dépenses & prestations
              </h2>
              <p className="mt-1 text-xs text-muted">
                Mis à jour le {updated}
              </p>
            </div>
            {[...totals.entries()].map(([currency, amount]) => (
              <p
                key={currency}
                className="font-display text-2xl font-extrabold text-[var(--admin-navy)]"
              >
                {amount.toLocaleString("fr-FR", {
                  style: "currency",
                  currency,
                })}
              </p>
            ))}
            {!totals.size && (
              <p className="text-sm text-muted">Aucun montant pour l’instant</p>
            )}
          </div>

          {!quote.quote_lines.length ? (
            <p className="mt-8 rounded-2xl bg-[var(--admin-sky)]/50 px-4 py-8 text-center text-sm text-muted">
              Votre agence prépare le détail des prestations. Revenez bientôt —
              ce lien se met à jour automatiquement.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border">
              {quote.quote_lines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                      {KIND_LABELS[line.kind] || line.kind}
                    </p>
                    <p className="mt-0.5 font-medium text-[var(--admin-navy)]">
                      {line.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {[
                        line.start_date && line.end_date
                          ? `${line.start_date} → ${line.end_date}`
                          : line.start_date || null,
                        line.confirmation ? `Réf. ${line.confirmation}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-[var(--admin-navy)]">
                    {typeof line.amount === "number"
                      ? line.amount.toLocaleString("fr-FR", {
                          style: "currency",
                          currency: line.currency || "EUR",
                        })
                      : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-muted">
          Document préparé par {quote.agency}. Lien personnel — ne pas
          partager inutilement.
        </p>
      </main>
    </div>
  );
}
