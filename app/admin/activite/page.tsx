import Link from "next/link";
import { JournalAvatar, JournalTimeline } from "@/components/admin/journal/JournalTimeline";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { activityFiltersFromParams, activityHref, loadActivityFeed, type ActivityFilters } from "@/lib/crm/agency-activity";
import { requirePermissionPage } from "@/lib/crm/agency-guard";
import {
  ACTIVITY_PERIOD_LABELS,
  ACTIVITY_PERIODS,
  JOURNAL_FAMILIES,
  JOURNAL_FAMILY_LABELS,
  JOURNAL_FAMILY_TONE,
} from "@/lib/crm/agency-journal-kinds";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Activité de l’agence" };

function Chip({ href, active, tone, children }: { href: string; active: boolean; tone?: "danger" | "warning" | "neutral"; children: React.ReactNode }) {
  const activeClass =
    tone === "danger"
      ? "border-[var(--admin-red)] bg-[var(--admin-red)] text-white"
      : tone === "warning"
        ? "border-[#b25e09] bg-[#b25e09] text-white"
        : "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white";
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active ? activeClass : "border-[var(--border)] bg-white text-[var(--admin-navy)] hover:border-[var(--admin-gold)]"
      }`}
    >
      {children}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      {children}
    </div>
  );
}

export default async function ActivitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermissionPage("view_activity");
  const filters = activityFiltersFromParams(await searchParams);
  const admin = createServiceClient({ allowPreview: true });
  const feed = await loadActivityFeed(admin, filters);
  const link = (patch: Partial<ActivityFilters>) => activityHref({ ...filters, ...patch });
  const chosenDossier = filters.bookingId ? feed.dossiers.find((row) => row.id === filters.bookingId) : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Activité de l’agence"
        subtitle="Tout ce que chaque collègue fait sur chaque dossier. Les cartes en rouge, les paiements et fournisseurs en orange."
      />

      <section className="admin-af-card mt-6 space-y-3 rounded-3xl p-5">
        <Group label="Période">
          {ACTIVITY_PERIODS.map((period) => (
            <Chip key={period} href={link({ period })} active={filters.period === period}>
              {ACTIVITY_PERIOD_LABELS[period]}
            </Chip>
          ))}
        </Group>
        <Group label="Collègue">
          <Chip href={link({ staffId: null })} active={!filters.staffId}>
            Tous
          </Chip>
          {feed.agents.map((agent) => (
            <Chip key={agent.id} href={link({ staffId: agent.id })} active={filters.staffId === agent.id}>
              <JournalAvatar name={agent.name} colorKey={agent.id} size={18} />
              {agent.name}
              {agent.count ? <span className="opacity-70">· {agent.count}</span> : null}
            </Chip>
          ))}
        </Group>
        <Group label="Type">
          <Chip href={link({ family: null, sensitiveOnly: false })} active={!filters.family && !filters.sensitiveOnly}>
            Tout
          </Chip>
          <Chip href={link({ family: null, sensitiveOnly: !filters.sensitiveOnly })} active={filters.sensitiveOnly} tone="danger">
            Cartes et paiements seulement
            {feed.sensitive ? <span className="opacity-80">· {feed.sensitive}</span> : null}
          </Chip>
          {JOURNAL_FAMILIES.map((family) => (
            <Chip
              key={family}
              href={link({ family, sensitiveOnly: false })}
              active={filters.family === family}
              tone={JOURNAL_FAMILY_TONE[family] === "danger" ? "danger" : JOURNAL_FAMILY_TONE[family] === "warning" ? "warning" : "neutral"}
            >
              {JOURNAL_FAMILY_LABELS[family]}
            </Chip>
          ))}
        </Group>
        {feed.dossiers.length || chosenDossier ? (
          <Group label="Dossier">
            <Chip href={link({ bookingId: null })} active={!filters.bookingId}>
              Tous
            </Chip>
            {feed.dossiers.map((dossier) => (
              <Chip key={dossier.id} href={link({ bookingId: dossier.id })} active={filters.bookingId === dossier.id}>
                {dossier.reference}
                <span className="opacity-70">· {dossier.count}</span>
              </Chip>
            ))}
          </Group>
        ) : null}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="admin-af-card rounded-2xl p-4">
          <p className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{feed.total}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            action{feed.total > 1 ? "s" : ""} · {ACTIVITY_PERIOD_LABELS[filters.period].toLowerCase()}
          </p>
        </div>
        <div className="admin-af-card rounded-2xl p-4">
          <p className="font-display text-3xl font-extrabold text-[var(--admin-red)]">{feed.sensitive}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">cartes et paiements</p>
        </div>
        <div className="admin-af-card rounded-2xl p-4">
          <p className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">{feed.agents.filter((agent) => agent.count > 0).length}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">collègues actifs</p>
        </div>
      </section>

      <section className="admin-af-card mt-6 rounded-3xl p-5">
        <JournalTimeline
          items={feed.items}
          showDossier
          emptyText={filters.period === "jour" ? "Rien pour l’instant aujourd’hui." : "Aucune action pour ces filtres."}
        />
        {feed.items.length >= 500 ? (
          <p className="mt-4 text-xs text-muted">Les 500 actions les plus récentes sont affichées. Affinez par collègue ou par dossier.</p>
        ) : null}
      </section>
    </div>
  );
}
