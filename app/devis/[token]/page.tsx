import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import type { QuoteLine } from "@/lib/mtrip/guide-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Suivi du devis | Travelba",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function PublicTripQuotePage({ params }: Props) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/i.test(token)) notFound();
  const { data } = await createServiceClient()
    .from("agency_mtrip_guides")
    .select("title,start_date,end_date,quote_lines,status")
    .eq("quote_token", token)
    .eq("status", "published")
    .maybeSingle();
  if (!data) notFound();

  const lines = Array.isArray(data.quote_lines)
    ? (data.quote_lines as QuoteLine[])
    : [];
  const currency = lines.find((line) => line.currency)?.currency || "EUR";
  const total = lines.reduce(
    (sum, line) => sum + (typeof line.amount === "number" ? line.amount : 0),
    0
  );

  return (
    <main className="min-h-screen bg-[var(--aura-surface)] px-4 py-10">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
        <header className="bg-[var(--admin-navy)] p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">
            Travelba · suivi sécurisé
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">{data.title}</h1>
          <p className="mt-2 text-sm text-white/70">
            {data.start_date || "Dates à confirmer"} —{" "}
            {data.end_date || "Dates à confirmer"}
          </p>
        </header>
        <section className="divide-y divide-border">
          {lines.map((line) => (
            <div key={line.id} className="flex items-start justify-between gap-4 p-5">
              <div>
                <p className="font-semibold text-[var(--admin-navy)]">{line.title}</p>
                <p className="text-xs text-muted">
                  {line.kind}
                  {line.confirmation ? ` · ${line.confirmation}` : ""}
                </p>
              </div>
              <strong className="shrink-0 text-[var(--admin-navy)]">
                {typeof line.amount === "number"
                  ? line.amount.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: line.currency || currency,
                    })
                  : "À confirmer"}
              </strong>
            </div>
          ))}
          {!lines.length ? (
            <p className="p-6 text-sm text-muted">Détail en préparation.</p>
          ) : null}
        </section>
        <footer className="flex items-center justify-between bg-[var(--aura-blue-soft)] p-6 text-[var(--admin-navy)]">
          <span className="font-semibold">Total du dossier</span>
          <strong className="font-display text-2xl">
            {total.toLocaleString("fr-FR", { style: "currency", currency })}
          </strong>
        </footer>
      </article>
    </main>
  );
}
