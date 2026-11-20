"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceSendPanel } from "@/components/admin/InvoiceSendPanel";
import { StatusChip } from "@/components/crm/ui";
import { formatMoney } from "@/lib/crm/money";
import type { Mb3mActivityChoice } from "@/lib/crm/mb3m-activity";
import {
  mb3mAmadeusSentence,
  mb3mAmadeusSuggestionSentence,
  mb3mInvoiceActionLabel,
  mb3mInvoiceChip,
  mb3mLettrageHoldNotice,
  mb3mReglementNote,
  type Mb3mPreparationView,
} from "@/lib/crm/mb3m-prep";

export type InvoiceMb3mCard = {
  id: string;
  label: string;
  amount: number | null;
  currency: string;
  category: "auto" | Mb3mActivityChoice;
};

export type InvoiceBlockView = {
  number: string | null;
  printed: boolean;
  marginStale: boolean;
  /** Somme des factures imprimées, pour le contrôle avec les ventes au livre. */
  printedTotal: number | null;
  saleTotal: number | null;
  preparation: Mb3mPreparationView;
  amadeus?: { label: string; invoiceNumber: string; placement: "move" | "here" | "other" }[];
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
  notice,
  cards = [],
  view,
  creditNoteAllowed = false,
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
  notice?: string | null;
  cards?: InvoiceMb3mCard[];
  view: InvoiceBlockView;
  /** Vrai seulement si MB3M_ALLOW_CREDIT_NOTE vaut true. Sinon l’avoir reste fermé. */
  creditNoteAllowed?: boolean;
  note: string | null;
  onBusy: (active: boolean) => void;
  onNote: (note: string | null) => void;
  onInvoiced: (number: string, note: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const reason = unsaved ? "Enregistrez le séjour avant de facturer." : blocker;
  const held = !reason && notice ? notice : null;

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
        reglements?: { montant: number; numero_mb3m: string | null; statut: "envoye" | "deja_dans_mb3m" | "erreur"; erreur?: string | null }[];
        amadeus?: { label: string; invoiceNumber: string; placement: "move" | "here" | "other" }[];
        suggestionsAmadeus?: { label: string; invoiceNumber: string }[];
        statut?: string | null;
        avertissement?: string | null;
      } | null;
      const held = mb3mLettrageHoldNotice(json);
      if (res.ok && held) {
        onNote(held);
        router.refresh();
        return;
      }
      if (!res.ok || !json?.number) {
        setError(json?.error || "La facture MB3M n’a pas abouti.");
        router.refresh();
        return;
      }
      const payments = [mb3mReglementNote(json.reglements || []), ...(json.amadeus || []).map((row) => mb3mAmadeusSentence(row)), ...(json.suggestionsAmadeus || []).map((row) => mb3mAmadeusSuggestionSentence(row))]
        .filter(Boolean)
        .join(" ");
      const message = json.printed
        ? `Facture MB3M n° ${json.number} validée. Le PDF est dans les pièces.`
        : json.replaced
          ? `Facture pro forma n° ${json.number} mise à jour. Elle se valide dans MB3M.`
          : json.created
            ? `Facture pro forma n° ${json.number} préparée. Elle se valide dans MB3M.`
            : `Facture pro forma n° ${json.number}. Elle se valide dans MB3M.`;
      onInvoiced(json.number, payments ? `${message} ${payments}` : message);
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
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        creditNote?: string;
        number?: string;
        statut?: string | null;
        avertissement?: string | null;
      } | null;
      const held = mb3mLettrageHoldNotice(json);
      if (res.ok && held) {
        onNote(held);
        router.refresh();
        return;
      }
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
  const chip = mb3mInvoiceChip({
    marginStale: view.marginStale,
    printed: view.printed,
    number: view.number,
    preparation: view.preparation.state,
  });
  const running = view.preparation.state === "running";
  const failed = view.preparation.state === "failed";
  const action = mb3mInvoiceActionLabel({
    invoicing,
    number: view.number,
    resume: view.preparation.resume,
    running,
  });
  const failedMessage =
    failed && view.preparation.message && view.preparation.message !== reason ? view.preparation.message : null;

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
        <StatusChip tone={chip.tone}>{view.number ? `${chip.label} · n° ${view.number}` : chip.label}</StatusChip>
      </div>

      {view.printed && view.marginStale ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-red)]/40 px-4 py-3">
          <p className="text-sm text-[var(--admin-navy)]">
            <span className="font-semibold">Marge à corriger.</span> La facture n° {view.number} est imprimée avec une autre
            marge.
          </p>
          {creditNoteAllowed ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reissue()}
              className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
            >
              Avoir et nouvelle facture
            </button>
          ) : (
            <p className="text-sm text-muted">
              L’avoir n’est pas émis depuis le CRM. Les pièces restent des pro forma.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || Boolean(reason) || running}
          onClick={() => void prepare()}
          className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
        >
          {action}
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
        {held ? <p className="text-sm text-[var(--admin-navy)]">{held}</p> : null}
      </div>
      {cards.length ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Divers terrestres facture ce vol en activité 22, fournisseur DIVERS TERRESTRE. Le vol reste au carnet.
          </p>
          <ul className="space-y-2">
            {cards.map((card) => (
              <Mb3mCategoryRow key={`${card.id}:${card.category}`} bookingId={bookingId} card={card} disabled={busy} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.number ? <InvoiceSendPanel bookingId={bookingId} /> : null}

      {control != null ? (
        <p className="text-xs text-muted">
          {control
            ? `Factures imprimées égales aux ventes au livre (${formatMoney(view.printedTotal || 0, "EUR")}).`
            : `Factures imprimées ${formatMoney(view.printedTotal || 0, "EUR")} · ventes au livre ${formatMoney(view.saleTotal || 0, "EUR")}.`}
        </p>
      ) : null}
      {running && view.preparation.message ? (
        <p className="text-sm text-[var(--admin-navy)]">{view.preparation.message}</p>
      ) : null}
      {view.amadeus?.length ? (
        <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
          {view.amadeus.map((row) => (
            <li key={`${row.invoiceNumber}-${row.label}`}>{mb3mAmadeusSentence(row)}</li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
      {failedMessage ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {failedMessage}
        </p>
      ) : null}
      {error && error !== failedMessage && error !== view.preparation.message ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Mb3mCategoryRow({
  bookingId,
  card,
  disabled,
}: {
  bookingId: string;
  card: InvoiceMb3mCard;
  disabled: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(card.category);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: InvoiceMb3mCard["category"]) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: card.id, mb3m_activity: next === "land" ? "land" : "automatique" }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setValue(previous);
        setError(json?.error || "La catégorie n’a pas été enregistrée.");
        return;
      }
      router.refresh();
    } catch {
      setValue(previous);
      setError("La catégorie n’a pas été enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  const price = card.amount == null ? "" : formatMoney(card.amount, card.currency);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-2">
      <p className="min-w-0 text-sm text-[var(--admin-navy)]">
        <span className="font-semibold">{card.label}</span>
        {price ? <span className="text-muted"> · {price}</span> : null}
      </p>
      <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
          Catégorie MB3M
        </span>
        <select
          aria-label={`Catégorie MB3M · ${card.label}`}
          value={value}
          disabled={disabled || saving}
          onChange={(event) => void change(event.target.value === "land" ? "land" : "auto")}
          className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--admin-navy)] disabled:opacity-50"
        >
          <option value="auto">Automatique</option>
          <option value="land">Divers terrestres</option>
        </select>
      </label>
      {error ? (
        <p role="alert" className="w-full text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </li>
  );
}
