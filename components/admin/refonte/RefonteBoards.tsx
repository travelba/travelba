import Link from "next/link";
import { EmptyState, PageEyebrow, PageTitle } from "@/components/crm/ui";
import type { RefonteSnapshot } from "@/lib/crm/refonte-load";
import { REFONTE_MENU, REFONTE_PREFIX, type MessageChannel } from "@/lib/crm/refonte-preview";
import { Dot, InertButton, StayLink } from "@/components/admin/refonte/RefonteBits";

const FILTERS: { id: "tous" | MessageChannel; label: string }[] = [
  { id: "tous", label: "Tout" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "mail", label: "Mails" },
  { id: "import", label: "Boîte d’import" },
];

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  whatsapp: "WhatsApp",
  mail: "Mail",
  import: "Import",
};

export function RefonteKanban({ snapshot }: { snapshot: RefonteSnapshot }) {
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Dossiers</PageEyebrow>
        <PageTitle title="Tableau des dossiers" subtitle="En préparation, Visible, En voyage, Terminée, Archivée." />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {snapshot.columns.map((column) => (
          <section key={column.id} aria-label={column.label} className="admin-af-card w-[280px] shrink-0 rounded-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">{column.label}</h2>
              <span className="text-sm font-semibold text-[var(--admin-gold-dark)]">{column.total}</span>
            </header>
            <ul className="space-y-2 p-3">
              {column.cards.length ? (
                column.cards.map((card) => (
                  <li key={card.id}>
                    <Link href={card.href} className="block rounded-xl bg-[var(--admin-sky)] px-3 py-3 hover:bg-[var(--admin-peach)]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--admin-navy)]">
                        <Dot tone={card.dot} />
                        <span className="truncate">{card.customer}</span>
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted">{card.place}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {card.reference} · {card.when}
                      </span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-1 py-4 text-sm text-muted">Aucun dossier.</li>
              )}
              {column.total > column.cards.length ? (
                <li className="px-1 text-xs font-semibold text-[var(--admin-gold-dark)]">
                  + {column.total - column.cards.length}
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function RefonteMessages({ snapshot, canal }: { snapshot: RefonteSnapshot; canal: string }) {
  const filter = FILTERS.some((item) => item.id === canal) ? (canal as (typeof FILTERS)[number]["id"]) : "tous";
  const rows = snapshot.messages.filter((row) => filter === "tous" || row.channel === filter);
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Messages</PageEyebrow>
        <PageTitle title="Messages" subtitle="WhatsApp, courriers et boîte d’import, dans le même fil." />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Canal">
        {FILTERS.map((item) => {
          const current = item.id === filter;
          const href = item.id === "tous" ? `${REFONTE_PREFIX}/messages` : `${REFONTE_PREFIX}/messages?canal=${item.id}`;
          return (
            <Link
              key={item.id}
              href={href}
              role="tab"
              aria-selected={current}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                current ? "bg-[var(--admin-navy)] text-white" : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="admin-af-card flex items-center gap-3 rounded-2xl px-4 py-3">
              <span className="w-16 shrink-0 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-gold-dark)]">
                {CHANNEL_LABEL[row.channel]}
              </span>
              <StayLink href={row.href} title={row.title} detail={row.preview} />
              {row.waiting ? <InertButton>Traiter</InertButton> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Aucun message" description="Ce canal est vide dans l’aperçu." />
      )}
    </div>
  );
}

export function RefonteClients({ snapshot }: { snapshot: RefonteSnapshot }) {
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Clients</PageEyebrow>
        <PageTitle title="Clients" subtitle="Prénom et initiale. Le dossier suivant ouvre l’aperçu." />
      </div>
      {snapshot.clients.length ? (
        <ul className="admin-af-card divide-y divide-[var(--border)] overflow-hidden rounded-2xl">
          {snapshot.clients.map((client) => (
            <li key={client.id}>
              <Link href={client.href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--admin-sky)]">
                <span>
                  <span className="block font-semibold text-[var(--admin-navy)]">{client.label}</span>
                  <span className="text-sm text-muted">{client.next || "Séjour"}</span>
                </span>
                <span className="text-sm tabular-nums text-[var(--admin-gold-dark)]">
                  {client.dossiers} dossier{client.dossiers > 1 ? "s" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Aucun client dans l’aperçu" />
      )}
    </div>
  );
}

export function RefonteAgence() {
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Agence</PageEyebrow>
        <PageTitle
          title="Agence"
          subtitle="Outils et Équipe tiennent dans cette sixième entrée. Les sept groupes du menu actuel sont couverts."
        />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {REFONTE_MENU.map((item) => (
          <li key={item.href} className="admin-af-card rounded-2xl px-4 py-4">
            <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">{item.group}</p>
            <Link href={item.href} className="mt-1 block font-display text-lg font-bold text-[var(--admin-navy)]">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Messages types, diagnostic Gmail, savoir du concierge et équipe restent dans l’agence actuelle. Cet aperçu ne les recopie pas.
      </p>
    </div>
  );
}
