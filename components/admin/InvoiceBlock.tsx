"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/crm/ui";
import { formatMoney } from "@/lib/crm/money";

export type InvoiceBlockView = {
  number: string | null;
  printed: boolean;
  marginStale: boolean;
  /** Somme des factures imprimées, pour le contrôle avec les ventes au livre. */
  printedTotal: number | null;
  saleTotal: number | null;
};

/**
 * Facture MB3M du dossier : préparer la pro forma, la voir, et l’avoir quand la marge a bougé.
 * Tout ce qui touche la pièce est ici ; le grand livre ne change pas.
 */
export function InvoiceBlock({
  bookingId,
  busy,
  invoicing,
  unsaved,
  blocker,
  view,
  note,
  onBusy,
  onNote,
  onInvoiced,
}: {
  bookingId: string;
  busy: boolean;
  invoicing: boolean;
  unsaved: boolean;
  blocker: string | null;
  view: InvoiceBlockView;
  note: string | null;
  onBusy: (active: boolean) => void;
  onNote: (note: string | null) => void;
  onInvoiced: (number: string, note: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const reason = unsaved ? "Enregistrez le séjour avant de facturer." : blocker;

  async function prepare() {
    onBusy(true);
    onNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/mb3m`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        number?: string;
        created?: boolean;
        replaced?: boolean;
        printed?: boolean;
      } | null;
      if (!res.ok || !json?.number) {
        setError(json?.error || "La facture MB3M n’a pas abouti.");
        return;
      }
      const message = json.printed
        ? `Facture MB3M n° ${json.number} validée. Le PDF est dans les pièces.`
        : json.replaced
          ? `Facture pro forma n° ${json.number} mise à jour. Elle se valide dans MB3M.`
          : json.created
            ? `Facture pro forma n° ${json.number} préparée. Elle se valide dans MB3M.`
            : `Facture pro forma n° ${json.number}. Elle se valide dans MB3M.`;
      onInvoiced(json.number, message);
    } catch {
      setError("La facture MB3M n’a pas abouti.");
    } finally {
      onBusy(false);
    }
  }

  async function reissue() {
    onBusy(true);
    onNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/mb3m`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reissue" }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; creditNote?: string; number?: string } | null;
      if (!res.ok || !json?.number) {
        setError(json?.error || "L’avoir n’a pas abouti.");
        return;
      }
      onNote(
        `Avoir n° ${json.creditNote || "—"} et facture pro forma n° ${json.number} préparés. Les deux se valident dans MB3M.`
      );
      router.refresh();
    } catch {
      setError("L’avoir n’a pas abouti.");
    } finally {
      onBusy(false);
    }
  }

  const control =
    view.printedTotal == null || view.saleTotal == null ? null : Math.abs(view.printedTotal - view.saleTotal) < 0.005;
  const stateLabel = view.marginStale
    ? "Marge à corriger"
    : view.printed
      ? "Imprimée"
      : view.number
        ? "Pro forma"
        : "À préparer";
  const stateTone: "green" | "gold" | "red" | "sky" = view.marginStale
    ? "red"
    : view.printed
      ? "green"
      : view.number
        ? "gold"
        : "sky";

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
            Facture MB3M
          </p>
          <p className="text-sm text-muted">
            Une ligne par dépense du séjour, la marge sur chaque ligne pointée. La pièce se valide en l’imprimant dans
            MB3M ; le grand livre ne change pas.
          </p>
        </div>
        <StatusChip tone={stateTone}>
          {view.number ? `${stateLabel} · n° ${view.number}` : stateLabel}
        </StatusChip>
      </div>

      {view.printed && view.marginStale ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-red)]/40 px-4 py-3">
          <p className="text-sm text-[var(--admin-navy)]">
            <span className="font-semibold">Marge à corriger.</span> La facture n° {view.number} est imprimée avec une autre
            marge.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reissue()}
            className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            Avoir et nouvelle facture
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || Boolean(reason)}
          onClick={() => void prepare()}
          className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
        >
          {invoicing ? "Préparation…" : view.number ? "Mettre à jour la pro forma" : "Préparer la facture"}
        </button>
        {view.number ? (
          <a
            href={`/api/admin/bookings/${bookingId}/mb3m`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[var(--admin-navy)] underline underline-offset-2"
          >
            Voir la pièce
          </a>
        ) : null}
        {reason ? <p className="text-sm text-muted">{reason}</p> : null}
      </div>

      {control != null ? (
        <p className="text-xs text-muted">
          {control
            ? `Factures imprimées égales aux ventes au livre (${formatMoney(view.printedTotal || 0, "EUR")}).`
            : `Factures imprimées ${formatMoney(view.printedTotal || 0, "EUR")} · ventes au livre ${formatMoney(view.saleTotal || 0, "EUR")}.`}
        </p>
      ) : null}
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
