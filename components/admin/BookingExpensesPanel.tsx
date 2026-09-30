"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import { agencyFeeFromGross, formatMoney } from "@/lib/crm/money";
import {
  feeSchedulePatch,
  initialFeeChoice,
  initialTicketingSelection,
  LODGING_FEE_EUR,
  LODGING_FEE_LABEL,
  MISC_FEE_LABEL,
  TICKETING_FEE_EUR,
  TRANSFER_FEE_EUR,
  TRANSFER_FEE_LABEL,
  type FeeChoice,
  type FeeMode,
} from "@/lib/crm/ticketing-fee";
import {
  isLedgerExpenseKind,
  visibleServiceCopy,
  type BookingStatus,
  type CrmBookingItem,
} from "@/lib/crm/types";

function postsNow(status: BookingStatus) {
  return status === "confirmed" || status === "travelling" || status === "completed";
}

function diversAmount(items: CrmBookingItem[]) {
  return items.reduce((sum, item) => {
    const amount = Number(item.amount);
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
}

export function BookingExpensesPanel({
  bookingId,
  items,
  status,
  currency = "EUR",
  agencyCommission = false,
  feeMode = null,
  ticketingFeeQty = 0,
  transferFee = false,
  lodgingFee = false,
  stayTotal = 0,
  travelerCount = 0,
  hasFlight = false,
}: {
  bookingId: string;
  items: CrmBookingItem[];
  status: BookingStatus;
  currency?: string;
  agencyCommission?: boolean;
  feeMode?: FeeMode;
  ticketingFeeQty?: number;
  transferFee?: boolean;
  lodgingFee?: boolean;
  stayTotal?: number;
  travelerCount?: number;
  hasFlight?: boolean;
}) {
  const router = useRouter();
  const expenses = items.filter((item) => isLedgerExpenseKind(item.kind));
  const opening = initialFeeChoice({ feeMode, agencyCommission });
  const openingTickets = initialTicketingSelection({
    feeMode,
    agencyCommission,
    storedQty: ticketingFeeQty,
    hasFlight,
    travelerCount,
  });
  const [mode, setMode] = useState<FeeChoice>(opening);
  const [ticketingOn, setTicketingOn] = useState(openingTickets.on);
  const [ticketingQty, setTicketingQty] = useState(openingTickets.qty);
  const [transferOn, setTransferOn] = useState(feeMode === "carte" && transferFee);
  const [lodgingOn, setLodgingOn] = useState(feeMode === "carte" && lodgingFee);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = initialFeeChoice({ feeMode, agencyCommission });
    const tickets = initialTicketingSelection({
      feeMode,
      agencyCommission,
      storedQty: ticketingFeeQty,
      hasFlight,
      travelerCount,
    });
    setMode(next);
    setTicketingOn(tickets.on);
    setTicketingQty(tickets.qty);
    setTransferOn(feeMode === "carte" && transferFee);
    setLodgingOn(feeMode === "carte" && lodgingFee);
  }, [feeMode, agencyCommission, ticketingFeeQty, transferFee, lodgingFee, hasFlight, travelerCount]);

  const commissionAmount = agencyFeeFromGross(stayTotal);
  const ticketAmount = ticketingOn ? Math.max(1, ticketingQty) * TICKETING_FEE_EUR : 0;
  const carteAmount =
    ticketAmount +
    (transferOn ? TRANSFER_FEE_EUR : 0) +
    (lodgingOn ? LODGING_FEE_EUR : 0) +
    diversAmount(expenses);
  const headerAmount = mode === "percent" ? commissionAmount : carteAmount;

  async function persist(next: {
    mode: FeeChoice;
    ticketingOn: boolean;
    ticketingQty: number;
    transferOn: boolean;
    lodgingOn: boolean;
  }) {
    const previous = { mode, ticketingOn, ticketingQty, transferOn, lodgingOn };
    setMode(next.mode);
    setTicketingOn(next.ticketingOn);
    setTicketingQty(next.ticketingQty);
    setTransferOn(next.transferOn);
    setLodgingOn(next.lodgingOn);
    if (next.mode === "percent") setEditingId(null);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feeSchedulePatch(next)),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMode(previous.mode);
      setTicketingOn(previous.ticketingOn);
      setTicketingQty(previous.ticketingQty);
      setTransferOn(previous.transferOn);
      setLodgingOn(previous.lodgingOn);
      setError(json.error || "Frais non enregistrés.");
      return;
    }
    router.refresh();
  }

  function beginNew() {
    setEditingId("new");
    setTitle(MISC_FEE_LABEL);
    setAmount(null);
    setError(null);
  }

  function beginEdit(item: CrmBookingItem) {
    setEditingId(item.id);
    setTitle(visibleServiceCopy(item.title) || MISC_FEE_LABEL);
    setAmount(item.amount);
    setError(null);
  }

  async function saveDivers() {
    const label = title.trim() || MISC_FEE_LABEL;
    if (amount == null || amount <= 0) {
      setError("Montant requis.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      kind: "expense",
      title: label,
      amount,
      include_in_ledger: true,
      supplier: null,
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      details: {},
    };
    const res =
      editingId && editingId !== "new"
        ? await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingId, ...payload }),
          })
        : await fetch(`/api/admin/bookings/${bookingId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Enregistrement impossible");
      return;
    }
    setEditingId(null);
    setTitle("");
    setAmount(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      setError("Suppression impossible.");
      return;
    }
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  const diversForm = editingId ? (
    <div key={editingId} className="space-y-3 rounded-2xl border border-border bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Libellé">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldControlClass}
            aria-label="Libellé du frais divers"
          />
        </Field>
        <Field label="Montant">
          <MoneyInput value={amount} onChange={setAmount} aria-label="Montant du frais divers" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveDivers()}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : editingId === "new" ? "Ajouter le frais" : "Enregistrer"}
        </button>
        <button type="button" className="text-sm font-semibold" onClick={() => setEditingId(null)}>
          Annuler
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Dépenses</h2>
          <p className="mt-1 text-xs text-muted">
            Hors itinéraire. Débit au client avec ce voyage.
            {postsNow(status)
              ? " Le dossier est confirmé : le débit part à l’enregistrement."
              : " Le débit part à la confirmation du dossier."}
          </p>
        </div>
        <p className="shrink-0 font-display text-lg font-bold text-[var(--admin-navy)]">
          {formatMoney(headerAmount, currency)}
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Type de frais">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "percent"}
          disabled={busy}
          onClick={() => {
            if (mode === "percent" && feeMode === "percent") return;
            void persist({
              mode: "percent",
              ticketingOn: false,
              ticketingQty,
              transferOn: false,
              lodgingOn: false,
            });
          }}
          className={`rounded-2xl border-2 p-3 text-left transition disabled:opacity-60 ${
            mode === "percent"
              ? "border-[var(--admin-gold)] bg-[#f8f4ec]"
              : "border-border bg-white"
          }`}
        >
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-[var(--admin-navy)]">Frais d’agence 10 %</span>
            <span className="text-sm font-semibold text-[var(--admin-navy)]">
              {formatMoney(commissionAmount, currency)}
            </span>
          </span>
          <span className="mt-1 block text-xs font-normal text-muted">
            10 % de {formatMoney(stayTotal, currency)}, le montant du séjour. Le virement reçu reste crédité en entier.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "carte"}
          disabled={busy}
          onClick={() => {
            if (mode === "carte" && feeMode === "carte") return;
            void persist({
              mode: "carte",
              ticketingOn,
              ticketingQty,
              transferOn,
              lodgingOn,
            });
          }}
          className={`rounded-2xl border-2 p-3 text-left transition disabled:opacity-60 ${
            mode === "carte"
              ? "border-[var(--admin-gold)] bg-[#f8f4ec]"
              : "border-border bg-white"
          }`}
        >
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-[var(--admin-navy)]">À la carte</span>
            <span className="text-sm font-semibold text-[var(--admin-navy)]">
              {formatMoney(carteAmount, currency)}
            </span>
          </span>
          <span className="mt-1 block text-xs font-normal text-muted">Cochez seulement ce qui s’applique.</span>
        </button>
      </div>
      {feeMode == null ? (
        <p className="mt-3 text-xs text-muted">
          Ancien calcul encore en place. Touchez un choix pour l’enregistrer.
        </p>
      ) : null}

      {mode === "carte" ? (
        <ul className="mt-3 space-y-2">
          <li className={`rounded-2xl border border-border px-3 py-2 ${ticketingOn ? "bg-white" : "bg-white/50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className={`flex min-w-0 flex-1 items-start gap-2 text-sm ${ticketingOn ? "" : "text-muted"}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ticketingOn}
                  disabled={busy}
                  aria-label="Frais de billeterie"
                  onChange={(event) =>
                    void persist({
                      mode: "carte",
                      ticketingOn: event.target.checked,
                      ticketingQty: Math.max(1, ticketingQty),
                      transferOn,
                      lodgingOn,
                    })
                  }
                />
                <span>
                  <span className="block font-medium text-[var(--admin-navy)]">Frais de billeterie</span>
                  <span className="block text-xs font-normal text-muted">{TICKETING_FEE_EUR} € par billet</span>
                </span>
              </label>
              <div className="flex items-center gap-3">
                {ticketingOn ? (
                  <div className="inline-flex items-center rounded-full border border-border bg-white">
                    <button
                      type="button"
                      className="h-8 w-8 text-base font-semibold disabled:opacity-40"
                      aria-label="Retirer un billet"
                      disabled={busy || ticketingQty <= 1}
                      onClick={() =>
                        void persist({
                          mode: "carte",
                          ticketingOn: true,
                          ticketingQty: ticketingQty - 1,
                          transferOn,
                          lodgingOn,
                        })
                      }
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-semibold" aria-live="polite">
                      {ticketingQty}
                    </span>
                    <button
                      type="button"
                      className="h-8 w-8 text-base font-semibold disabled:opacity-40"
                      aria-label="Ajouter un billet"
                      disabled={busy || ticketingQty >= 99}
                      onClick={() =>
                        void persist({
                          mode: "carte",
                          ticketingOn: true,
                          ticketingQty: ticketingQty + 1,
                          transferOn,
                          lodgingOn,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                ) : null}
                <span className={`w-24 text-right text-sm font-semibold ${ticketingOn ? "text-[var(--admin-navy)]" : "text-muted"}`}>
                  {ticketingOn ? formatMoney(ticketAmount, currency) : "—"}
                </span>
              </div>
            </div>
          </li>
          <FeeCheck
            label={TRANSFER_FEE_LABEL}
            hint={`${TRANSFER_FEE_EUR} €`}
            checked={transferOn}
            amount={TRANSFER_FEE_EUR}
            currency={currency}
            disabled={busy}
            onChange={(checked) =>
              void persist({
                mode: "carte",
                ticketingOn,
                ticketingQty,
                transferOn: checked,
                lodgingOn,
              })
            }
          />
          <FeeCheck
            label={LODGING_FEE_LABEL}
            hint={`${LODGING_FEE_EUR} €`}
            checked={lodgingOn}
            amount={LODGING_FEE_EUR}
            currency={currency}
            disabled={busy}
            onChange={(checked) =>
              void persist({
                mode: "carte",
                ticketingOn,
                ticketingQty,
                transferOn,
                lodgingOn: checked,
              })
            }
          />
          {expenses.map((item) =>
            editingId === item.id ? (
              <li key={item.id}>{diversForm}</li>
            ) : (
              <li key={item.id} className="rounded-2xl border border-border bg-white px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--admin-navy)]">
                      {visibleServiceCopy(item.title) || MISC_FEE_LABEL}
                    </p>
                    <p className="text-xs text-muted">Montant libre · absent de l’itinéraire</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[var(--admin-navy)]">
                      {item.amount != null ? formatMoney(Number(item.amount), currency) : "—"}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--admin-navy)]"
                      onClick={() => beginEdit(item)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-accent"
                      onClick={() => void remove(item.id)}
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              </li>
            )
          )}
          {editingId === "new" ? <li>{diversForm}</li> : null}
          {editingId ? null : (
            <li>
              <button
                type="button"
                className="text-sm font-semibold text-[var(--admin-navy)] underline"
                onClick={beginNew}
              >
                Ajouter un autre frais
              </button>
            </li>
          )}
        </ul>
      ) : null}

      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </section>
  );
}

function FeeCheck({
  label,
  hint,
  checked,
  amount,
  currency,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  amount: number;
  currency: string;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <li className={`rounded-2xl border border-border px-3 py-2 ${checked ? "bg-white" : "bg-white/50"}`}>
      <div className="flex items-center justify-between gap-3">
        <label className={`flex min-w-0 flex-1 items-start gap-2 text-sm ${checked ? "" : "text-muted"}`}>
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            disabled={disabled}
            aria-label={label}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            <span className="block font-medium text-[var(--admin-navy)]">{label}</span>
            <span className="block text-xs font-normal text-muted">{hint}</span>
          </span>
        </label>
        <span className={`text-sm font-semibold ${checked ? "text-[var(--admin-navy)]" : "text-muted"}`}>
          {checked ? formatMoney(amount, currency) : "—"}
        </span>
      </div>
    </li>
  );
}
