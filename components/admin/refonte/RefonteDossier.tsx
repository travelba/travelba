import Link from "next/link";
import { BOOKING_ITEM_LABELS, type BookingItemKind } from "@/lib/crm/types";
import {
  DOSSIER_TABS,
  REFONTE_PREFIX,
  dossierTabHref,
  type DossierTabId,
  type DossierView,
} from "@/lib/crm/refonte-preview";
import { PageEyebrow, StatusChip } from "@/components/crm/ui";
import { InertButton, euro, formatDateFr } from "@/components/admin/refonte/RefonteBits";

const CHANNEL: Record<string, string> = {
  etape: "Étape",
  whatsapp: "WhatsApp",
  mail: "Mail",
  import: "Import",
  concierge: "Concierge",
};

export function RefonteDossier({ dossier, tab }: { dossier: DossierView; tab: DossierTabId }) {
  const tone = dossier.column === "archivee" ? "navy" : dossier.column === "voyage" ? "green" : dossier.column === "visible" ? "gold" : "amber";
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>
          <Link href={`${REFONTE_PREFIX}/dossiers`} className="hover:underline">
            Dossiers
          </Link>
        </PageEyebrow>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)] sm:text-4xl">
              {dossier.place}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {dossier.reference} · {dossier.customer} · {dossier.when}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip tone={tone}>{dossier.columnLabel}</StatusChip>
            <InertButton tone="accent">{dossier.primary}</InertButton>
          </div>
        </div>
      </div>

      <ol aria-label="Avancement du dossier" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {dossier.steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className={`rounded-2xl border px-3 py-3 ${
              step.state === "current"
                ? "border-[var(--admin-gold)] bg-[var(--admin-peach)]"
                : step.state === "done"
                  ? "border-transparent bg-[var(--admin-navy)] text-white"
                  : "border-[var(--border)] bg-white text-muted"
            }`}
          >
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{index + 1}</span>
            <span className="mt-1 block text-sm font-semibold leading-snug">{step.label}</span>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 min-w-0 lg:order-1">
          <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Dossier">
            {DOSSIER_TABS.map((item) => {
              const current = item.id === tab;
              const count = item.id === "faire" ? dossier.tasks.length : 0;
              return (
                <Link
                  key={item.id}
                  href={dossierTabHref(dossier.id, item.id)}
                  role="tab"
                  aria-selected={current}
                  className={`admin-tap inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${
                    item.id === "interface"
                      ? current
                        ? "bg-[var(--admin-gold)] text-[var(--admin-navy)]"
                        : "bg-[rgba(197,168,128,0.18)] text-[#7a6344]"
                      : current
                        ? "bg-[var(--admin-navy)] text-white"
                        : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
                  }`}
                >
                  {item.label}
                  {count > 0 ? <span className="tabular-nums opacity-80">{count}</span> : null}
                </Link>
              );
            })}
          </div>
          <div className="admin-af-card mt-3 rounded-2xl p-5" role="tabpanel">
            <TabBody dossier={dossier} tab={tab} />
          </div>
        </div>
        <aside aria-label="Fiche rapide" className="admin-af-card order-1 space-y-5 rounded-2xl p-5 lg:sticky lg:top-24 lg:order-2">
          <PanelBlock title="Client" body={dossier.customer} />
          <div>
            <h2 className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Voyageurs</h2>
            {dossier.travelers.length ? (
              <ul className="mt-2 space-y-1 text-sm text-[var(--admin-navy)]">
                {dossier.travelers.map((traveler) => (
                  <li key={traveler.id}>{traveler.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Aucun voyageur posé.</p>
            )}
          </div>
          <PanelBlock title="Prix du séjour" body={euro(dossier.finance.sale, dossier.finance.currency)} />
          <PanelBlock title="Encours" body={dossier.finance.balance == null ? "—" : euro(dossier.finance.balance)} />
          <div>
            <h2 className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Dernier message</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--admin-navy)]">{dossier.lastMessage || "Aucun message."}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">{title}</h2>
      <p className="mt-2 font-display text-lg font-bold text-[var(--admin-navy)]">{body}</p>
    </div>
  );
}

function TabBody({ dossier, tab }: { dossier: DossierView; tab: DossierTabId }) {
  if (tab === "client") {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">{dossier.customer}</h2>
        <p className="text-sm text-muted">Les coordonnées et les numéros de pièce restent masqués dans cet aperçu.</p>
        <ul className="divide-y divide-[var(--border)]">
          {dossier.travelers.map((traveler) => (
            <li key={traveler.id} className="flex items-center justify-between py-3 text-sm">
              <span className="font-semibold text-[var(--admin-navy)]">{traveler.label}</span>
              <span className="text-muted">{traveler.hasPassport ? "Passeport au dossier" : "Passeport manquant"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (tab === "whatsapp") {
    const rows = dossier.timeline.filter((event) => event.channel === "whatsapp" || event.channel === "concierge");
    return <Feed title="WhatsApp" empty="Aucun échange sur ce dossier." rows={rows} />;
  }
  if (tab === "faire") {
    return dossier.tasks.length ? (
      <ul className="space-y-2">
        {dossier.tasks.map((task) => (
          <li key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--admin-sky)] px-3 py-3">
            <span>
              <span className="block font-semibold text-[var(--admin-navy)]">{task.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{task.detail}</span>
            </span>
            <InertButton>{task.action}</InertButton>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-[var(--admin-navy)]">Rien n’attend l’agence sur ce dossier.</p>
    );
  }
  if (tab === "carte") {
    return (
      <div className="space-y-3">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">
          {dossier.cardCount ? `${dossier.cardCount} carte${dossier.cardCount > 1 ? "s" : ""} émise${dossier.cardCount > 1 ? "s" : ""}` : "Aucune carte émise"}
        </h2>
        <p className="text-sm text-muted">Le numéro, l’expiration et le cryptogramme ne sont pas affichés.</p>
        <InertButton>Émettre une carte</InertButton>
      </div>
    );
  }
  if (tab === "reglement") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted">Le prix vendu est celui du dossier. Le coût et la marge sont fictifs.</p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label="Prix vendu" value={euro(dossier.finance.sale, dossier.finance.currency)} />
          <Stat label="Coût fictif" value={euro(dossier.finance.cost)} />
          <Stat label="Marge fictive" value={euro(dossier.finance.margin)} />
        </dl>
        <p className="text-sm text-[var(--admin-navy)]">
          {dossier.finance.under == null ? "Taux non lu." : dossier.finance.under ? "Sous le seuil de 12 %." : "Au-dessus du seuil de 12 %."}
        </p>
      </div>
    );
  }
  if (tab === "interface") {
    return (
      <div className="mx-auto max-w-[480px] rounded-[28px] bg-[#F7F4EE] px-4 py-6 text-[var(--admin-navy)]">
        <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold-dark)]">Espace client</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold">{dossier.place}</h2>
        <p className="mt-1 text-sm">{dossier.when}</p>
        <p className="mt-4 text-sm">{dossier.visible ? "Montré dans l’espace." : "Pas encore montré au client."}</p>
        <ul className="mt-4 space-y-2">
          {dossier.items.slice(0, 6).map((item) => (
            <li key={item.id} className="rounded-2xl bg-white px-3 py-3 text-sm">
              <span className="font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-muted">{kindLabel(item.kind)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {dossier.items.length ? (
          dossier.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-[var(--border)] px-3 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">{kindLabel(item.kind)}</p>
              <p className="mt-1 font-semibold text-[var(--admin-navy)]">{item.title}</p>
              <p className="text-sm text-muted">
                {item.when}
                {item.kind === "hotel" ? ` · ${item.confirmed ? "Confirmation enregistrée" : "Confirmation manquante"}` : ""}
              </p>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">Aucune étape au dossier.</li>
        )}
      </ul>
      <Feed title="Fil du dossier" empty="Le fil est vide." rows={dossier.timeline} />
    </div>
  );
}

function Feed({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; at: string | null; title: string; detail: string; channel: string }[];
}) {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</h2>
      {rows.length ? (
        <ol className="mt-3 space-y-3 border-l border-[var(--border)] pl-4">
          {rows.map((row) => (
            <li key={row.id}>
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                {CHANNEL[row.channel] || row.channel}
                {row.at ? ` · ${formatDateFr(row.at)}` : ""}
              </p>
              <p className="mt-1 font-semibold text-[var(--admin-navy)]">{row.title}</p>
              <p className="text-sm text-muted">{row.detail}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--admin-sky)] px-3 py-3">
      <dt className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">{label}</dt>
      <dd className="mt-1 font-display text-lg font-extrabold tabular-nums text-[var(--admin-navy)]">{value}</dd>
    </div>
  );
}

function kindLabel(kind: string) {
  if (kind in BOOKING_ITEM_LABELS) return BOOKING_ITEM_LABELS[kind as BookingItemKind];
  return "Étape";
}
