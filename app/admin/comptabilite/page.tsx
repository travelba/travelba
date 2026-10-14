import Link from "next/link";
import { OutgoingQueue } from "@/components/admin/OutgoingQueue";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { requireStaffPage } from "@/lib/crm/auth";
import type { TripCostSource } from "@/lib/crm/trip-costs";
import { loadOutgoingQueue } from "@/lib/crm/trip-costs-db";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Comptabilité" };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: { value: "" | TripCostSource; label: string }[] = [
  { value: "", label: "Toutes les sorties" },
  { value: "pliant", label: "Pliant" },
  { value: "revolut", label: "Revolut" },
];

function day(value: SearchParamValue) {
  const raw = (firstParam(value) || "").trim();
  return ISO_DAY.test(raw) ? raw : null;
}

function href(source: string, from: string | null, to: string | null) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (from) params.set("du", from);
  if (to) params.set("au", to);
  const query = params.toString();
  return query ? `/admin/comptabilite?${query}` : "/admin/comptabilite";
}

/** Toutes les sorties pas encore rattachées à un voyage, Pliant et Revolut réunies. */
export default async function AdminComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  await requireStaffPage();
  const params = await searchParams;
  const sourceParam = firstParam(params.source);
  const source: TripCostSource | null = sourceParam === "pliant" || sourceParam === "revolut" ? sourceParam : null;
  const from = day(params.du);
  const to = day(params.au);

  const admin = createServiceClient();
  let lines: Awaited<ReturnType<typeof loadOutgoingQueue>> = [];
  let outside = { pliant: 0, revolut: 0 };
  try {
    const [queue, pliantOutside, revolutOutside] = await Promise.all([
      loadOutgoingQueue({ source, from, to, limit: 500 }, admin),
      admin.from("crm_pliant_transactions").select("id", { count: "exact", head: true }).eq("match_status", "ignored"),
      admin
        .from("crm_revolut_transactions")
        .select("id", { count: "exact", head: true })
        .eq("direction", "debit")
        .eq("status", "ignored"),
    ]);
    lines = queue;
    outside = { pliant: pliantOutside.count || 0, revolut: revolutOutside.count || 0 };
  } catch (err) {
    console.error("[admin/comptabilite]", err instanceof Error ? err.message : err);
  }

  const withSuggestion = lines.filter((line) => line.suggestions.length > 0).length;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Comptabilité"
        subtitle="Chaque sortie Pliant ou Revolut est un coût. Elle se rattache à une ligne vendue d’un voyage, ou reste hors voyage. Rien ne part sans le clic Rattacher ; le client ne voit ni coût ni marge."
      />

      <form method="get" action="/admin/comptabilite" className="admin-af-card mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Source">
          {SOURCES.map((option) => {
            const active = (source || "") === option.value;
            return (
              <Link
                key={option.value || "all"}
                href={href(option.value, from, to)}
                aria-current={active ? "page" : undefined}
                className={`admin-tap inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${
                  active
                    ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--admin-navy)]"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
        {source ? <input type="hidden" name="source" value={source} /> : null}
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Du
          <input
            type="date"
            name="du"
            defaultValue={from || ""}
            className="mt-1 block min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--admin-navy)]"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Au
          <input
            type="date"
            name="au"
            defaultValue={to || ""}
            className="mt-1 block min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[var(--admin-navy)]"
          />
        </label>
        <button type="submit" className="admin-af-btn admin-tap min-h-10 rounded-full px-4 text-sm font-semibold">
          Filtrer
        </button>
        {from || to ? (
          <Link href={href(source || "", null, null)} className="text-sm font-semibold text-[#9e7e51] underline">
            Toute la période
          </Link>
        ) : null}
      </form>

      <section className="admin-af-card mt-6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--admin-navy)]">À rattacher</h2>
          <p className="text-sm text-muted">
            {lines.length === 0
              ? "Aucune sortie en attente."
              : `${lines.length} sortie${lines.length > 1 ? "s" : ""} · ${withSuggestion} avec une proposition`}
          </p>
        </div>
        <OutgoingQueue lines={lines} />
      </section>

      <p className="mt-4 text-sm text-muted">
        Hors voyage : {outside.pliant} dépense{outside.pliant > 1 ? "s" : ""} Pliant et {outside.revolut} sortie
        {outside.revolut > 1 ? "s" : ""} Revolut. Elles se remettent dans la file depuis{" "}
        <Link href="/admin/pliant" className="underline">
          Pliant
        </Link>{" "}
        et{" "}
        <Link href="/admin/revolut" className="underline">
          Revolut
        </Link>
        .
      </p>
    </div>
  );
}
