import Link from "next/link";
import { JournalTimeline } from "@/components/admin/journal/JournalTimeline";
import type { AgentDigest } from "@/lib/crm/agency-activity";
import { activityHref } from "@/lib/crm/agency-activity";
import { journalWhen } from "@/lib/crm/agency-journal-kinds";

function Metric({ value, label, tone = "navy" }: { value: string | number; label: string; tone?: "navy" | "red" }) {
  return (
    <div className="rounded-2xl bg-[var(--admin-sky)] px-4 py-3">
      <p className={`font-display text-2xl font-extrabold ${tone === "red" ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]"}`}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
    </div>
  );
}

/** Résumé d’un collègue : dossiers en charge, actions du jour, cartes et paiements du jour, dernières actions. */
export function AgentDigestCard({ staffId, name, digest }: { staffId: string; name: string; digest: AgentDigest }) {
  return (
    <section className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Résumé de {name}</p>
        <Link href={activityHref({ staffId, period: "semaine" })} className="text-sm font-semibold text-[var(--admin-navy)] underline">
          Toute son activité
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric value={digest.ownedCount} label={`dossier${digest.ownedCount > 1 ? "s" : ""} en charge`} />
        <Metric value={digest.actionsToday} label="actions aujourd’hui" />
        <Metric value={digest.sensitiveToday} label="cartes et paiements aujourd’hui" tone="red" />
        <Metric value={digest.lastAt ? journalWhen(digest.lastAt) : "—"} label="dernière activité" />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Dernières actions</p>
        <JournalTimeline items={digest.recent} showDossier emptyText="Aucune action ces trente derniers jours." />
      </div>
    </section>
  );
}
