import Link from "next/link";
import { EmptyState, PageEyebrow, PageTitle, StatusChip } from "@/components/crm/ui";
import type { RefonteSnapshot } from "@/lib/crm/refonte-load";
import { REFONTE_PREFIX } from "@/lib/crm/refonte-preview";
import { Dot, InertButton, SectionTitle, StayLink, dayHead, euro, formatDateFr } from "@/components/admin/refonte/RefonteBits";

const MARK: Record<"depart" | "sur_place" | "retour", string> = {
  depart: "Départ",
  sur_place: "Sur place",
  retour: "Retour",
};

export function RefonteHome({ snapshot }: { snapshot: RefonteSnapshot }) {
  return (
    <div className="space-y-8">
      <div>
        <PageEyebrow>Aujourd’hui</PageEyebrow>
        <PageTitle title="Ce qui a besoin de moi" subtitle={formatDateFr(snapshot.today)} />
      </div>

      <section aria-labelledby="besoin-titre" className="space-y-3">
        <SectionTitle
          id="besoin-titre"
          title="À traiter"
          aside={<span className="text-sm font-semibold text-[var(--admin-gold-dark)]">{snapshot.counts.tasks}</span>}
        />
        {snapshot.tasks.length ? (
          <ul className="space-y-2">
            {snapshot.tasks.map((task) => (
              <li key={task.id} className="admin-af-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <Dot
                  tone={task.kind === "depart_document" || task.kind === "formalite" || task.kind === "paiement" ? "red" : task.kind === "email" ? "orange" : "orange"}
                />
                <StayLink href={task.href} title={task.title} detail={task.detail} />
                <InertButton>{task.action}</InertButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Rien n’attend l’agence" description="Les départs, formalités, mails et paiements à jour n’apparaissent pas ici." />
        )}
      </section>

      <section aria-labelledby="semaine-titre" className="space-y-3">
        <SectionTitle id="semaine-titre" title="Cette semaine" />
        <div className="admin-af-card overflow-x-auto rounded-2xl">
          <ol className="grid min-w-[880px] grid-cols-7 divide-x divide-[var(--border)]">
            {snapshot.week.map((day) => (
              <li key={day.day} className="min-h-36 px-3 py-3">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                  {dayHead(day.day)}
                </p>
                <ul className="mt-2 space-y-2">
                  {day.events.map((event) => (
                    <li key={event.id}>
                      <Link href={event.href} className="flex items-start gap-2 text-xs leading-snug">
                        <Dot tone={event.dot} label={MARK[event.kind]} />
                        <span>
                          <span className="font-semibold text-[var(--admin-navy)]">{MARK[event.kind]}</span>
                          <span className="mt-0.5 block text-muted">{event.label}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <MoneyCard snapshot={snapshot} />
        <section aria-labelledby="panne-titre" className="admin-af-card space-y-3 rounded-2xl p-5">
          <SectionTitle id="panne-titre" title="Dossiers en panne" />
          <p className="text-sm text-muted">Sans mise à jour depuis 14 jours, départ encore devant.</p>
          {snapshot.stuck.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {snapshot.stuck.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <Dot tone={row.dot} />
                  <StayLink href={row.href} title={`${row.customer} · ${row.place}`} detail={`${row.reference} · ${row.when}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--admin-navy)]">Aucun dossier en panne.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export function MoneyCard({ snapshot }: { snapshot: RefonteSnapshot }) {
  const money = snapshot.money;
  return (
    <section aria-labelledby="argent-titre" className="admin-af-card space-y-4 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle id="argent-titre" title="Argent du mois" />
        {money.under == null ? (
          <StatusChip tone="gold">Taux non lu</StatusChip>
        ) : money.under ? (
          <StatusChip tone="red">Sous 12 %</StatusChip>
        ) : (
          <StatusChip tone="green">Au-dessus de 12 %</StatusChip>
        )}
      </div>
      <p className="text-sm text-muted">
        {money.dossiers} séjour{money.dossiers > 1 ? "s" : ""} sur le mois. Montants fictifs, seuil de marge 12 %.
      </p>
      <dl className="grid grid-cols-3 gap-3">
        <MoneyStat label="Vente" value={euro(money.sale)} />
        <MoneyStat label="Coût" value={euro(money.cost)} />
        <MoneyStat label="Marge" value={euro(money.margin)} />
      </dl>
      <Link href={`${REFONTE_PREFIX}/argent`} className="text-sm font-semibold text-[var(--admin-navy)]">
        Voir l’argent →
      </Link>
    </section>
  );
}

function MoneyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--admin-sky)] px-3 py-3">
      <dt className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">{label}</dt>
      <dd className="mt-1 font-display text-lg font-extrabold tabular-nums text-[var(--admin-navy)]">{value}</dd>
    </div>
  );
}

export function RefonteArgent({ snapshot }: { snapshot: RefonteSnapshot }) {
  const under = snapshot.dossiers.filter((dossier) => dossier.finance.under === true);
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Argent</PageEyebrow>
        <PageTitle title="Argent du mois" subtitle="Le coût et la marge sont fictifs. Le seuil, lui, suit les sorties rapprochées." />
      </div>
      <MoneyCard snapshot={snapshot} />
      <section aria-labelledby="seuil-titre" className="space-y-3">
        <SectionTitle id="seuil-titre" title="Sous le seuil" />
        {under.length ? (
          <ul className="space-y-2">
            {under.map((dossier) => (
              <li key={dossier.id} className="admin-af-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <StayLink
                  href={dossier.href}
                  title={`${dossier.customer} · ${dossier.place}`}
                  detail={`${dossier.reference} · marge fictive ${euro(dossier.finance.margin)}`}
                />
                <InertButton>Ouvrir le règlement</InertButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={snapshot.costsKnown ? "Aucune marge sous 12 %" : "Taux non lu sur cet aperçu"}
            description={
              snapshot.costsKnown
                ? "Les séjours du mois avec une sortie rapprochée restent au-dessus du seuil."
                : "Les sorties ne sont pas lues ici. Les montants affichés restent fictifs."
            }
          />
        )}
      </section>
    </div>
  );
}
