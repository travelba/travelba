"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { LedgerWarningNotice } from "@/components/crm/LedgerWarningNotice";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import { readLedgerWarning } from "@/lib/crm/ledger-warning";
import { agencyFeeBaseFromItems } from "@/lib/crm/bookings";
import { formatAgencyFeePercent } from "@/lib/crm/agency-fee-rate";
import { agencyFeeFromGross, formatMoney } from "@/lib/crm/money";
import { isAutoTicketingExpense, ticketingExpenseTouched, AUTO_TICKETING_FEE } from "@/lib/crm/ticketing-fee";
import {
  DEFAULT_EXPENSE_PRESETS,
  TICKETING_PRESET_BLOCKED,
  expenseFromPreset,
  ticketingPresetBlocked,
  type ExpensePreset,
} from "@/lib/crm/expense-presets";
import { expensePricingLabel, parseExpenseQuantity, readExpensePricing } from "@/lib/crm/expense-pricing";
import { pliantExpenseOrigin } from "@/lib/crm/pliant-expense";
import { expenseAwaitsValidation } from "@/lib/crm/expense-validation";
import { formatDateFr } from "@/lib/crm/dates";
import {
  AGENCY_FEE_LABEL,
  isLedgerExpenseKind,
  visibleServiceCopy,
  type CrmBookingItem,
} from "@/lib/crm/types";

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function postsNow(visible: boolean) {
  return visible;
}

export type ExpenseWrite = {
  id: string;
  previousTitle: string;
  title: string;
  previousAmount: number;
  amount: number;
  removed?: boolean;
  /** La dépense automatique vient d’être validée : elle compte côté client. */
  validated?: boolean;
};

export function BookingExpensesPanel({
  bookingId,
  items,
  visible = false,
  currency = "EUR",
  agencyCommission = false,
  agencyFeeRate = 0.1,
  presets = DEFAULT_EXPENSE_PRESETS,
  onExpenseWrite,
}: {
  bookingId: string;
  items: CrmBookingItem[];
  visible?: boolean;
  currency?: string;
  agencyCommission?: boolean;
  agencyFeeRate?: number;
  /** Raccourcis actifs. Tableau vide : l’agence les a retirés. */
  presets?: readonly ExpensePreset[];
  /** Le prix dans Transactions suit tout de suite, sans recharger la page. */
  onExpenseWrite?: (change: ExpenseWrite) => void;
}) {
  const router = useRouter();
  const expenses = items.filter((item) => isLedgerExpenseKind(item.kind));
  const awaitingCount = expenses.filter((item) => expenseAwaitsValidation(item)).length;
  const [commissionOn, setCommissionOn] = useState(agencyCommission);
  // Le serveur a changé la commission (router.refresh) : l’interrupteur suit, sans effet.
  const [syncedCommission, setSyncedCommission] = useState(agencyCommission);
  if (syncedCommission !== agencyCommission) {
    setSyncedCommission(agencyCommission);
    setCommissionOn(agencyCommission);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dépense enregistrée mais grand livre refusé : visible jusqu’au prochain enregistrement réussi.
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);
  const quantity = parseExpenseQuantity(quantityText);

  function beginNew() {
    setEditingId("new");
    setTitle("");
    setQuantityText("1");
    setUnitPrice(null);
    setAmount(null);
    setError(null);
  }

  function beginEdit(item: CrmBookingItem) {
    const pricing = readExpensePricing(item.details, item.amount);
    setEditingId(item.id);
    setTitle(visibleServiceCopy(item.title));
    setQuantityText(pricing.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3, useGrouping: false }));
    setUnitPrice(pricing.unitPrice);
    setAmount(item.amount);
    setError(null);
  }

  /** Quantité ou prix unitaire : le montant suit. */
  function changeQuantity(text: string) {
    setQuantityText(text);
    const next = parseExpenseQuantity(text);
    if (next != null && unitPrice != null) setAmount(cents(next * unitPrice));
  }

  function changeUnitPrice(next: number | null) {
    setUnitPrice(next);
    if (next != null && quantity != null) setAmount(cents(next * quantity));
  }

  /** Montant saisi directement : la quantité reste, le prix unitaire se recalcule. */
  function changeAmount(next: number | null) {
    setAmount(next);
    if (next != null && quantity != null && quantity > 0) setUnitPrice(cents(next / quantity));
  }

  async function save() {
    const label = title.trim();
    if (!label) {
      setError("Libellé requis.");
      return;
    }
    if (quantity == null) {
      setError("Quantité invalide (un nombre supérieur à zéro).");
      return;
    }
    if (amount == null || amount <= 0) {
      setError("Montant requis.");
      return;
    }
    if ((editingId === "new" || !editingId) && ticketingPresetBlocked(presets, label, expenses)) {
      setError(TICKETING_PRESET_BLOCKED);
      return;
    }
    setBusy(true);
    setError(null);
    const current = expenses.find((item) => item.id === editingId);
    // Les détails déjà sur la ligne (origine Pliant, frais de billeterie) restent ; seuls quantité et prix unitaire changent.
    const keptDetails =
      current?.details && typeof current.details === "object" && !Array.isArray(current.details)
        ? { ...(current.details as Record<string, unknown>) }
        : {};
    const payload = {
      kind: "expense",
      title: label,
      quantity,
      unit_price: unitPrice ?? cents(amount / quantity),
      amount,
      include_in_ledger: true,
      supplier: null,
      confirmation_ref: null,
      details:
        current && isAutoTicketingExpense(current)
          ? { ...keptDetails, auto_fee: AUTO_TICKETING_FEE, fee_touched: true }
          : keptDetails,
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
    setLedgerNote(readLedgerWarning(json));
    const id =
      editingId && editingId !== "new" ? editingId : String((json.item as { id?: string } | undefined)?.id || "");
    if (id) {
      onExpenseWrite?.({
        id,
        previousTitle: current ? visibleServiceCopy(current.title) : label,
        title: label,
        previousAmount: current?.amount == null ? 0 : Number(current.amount),
        amount,
      });
    }
    setEditingId(null);
    setTitle("");
    setQuantityText("1");
    setUnitPrice(null);
    setAmount(null);
    if (!(id && onExpenseWrite)) router.refresh();
  }

  /** Un clic : même écriture que le formulaire, quantité 1, libellé et montant du raccourci. */
  async function addPreset(preset: ExpensePreset) {
    if (ticketingPresetBlocked(presets, preset.label, expenses)) {
      setError(TICKETING_PRESET_BLOCKED);
      return;
    }
    setBusy(true);
    setError(null);
    const payload = expenseFromPreset(preset);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
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
    setLedgerNote(readLedgerWarning(json));
    const id = String((json.item as { id?: string } | undefined)?.id || "");
    if (id) {
      onExpenseWrite?.({
        id,
        previousTitle: payload.title,
        title: payload.title,
        previousAmount: 0,
        amount: payload.amount,
      });
    }
    setEditingId(null);
    setTitle("");
    setQuantityText("1");
    setUnitPrice(null);
    setAmount(null);
    if (!(id && onExpenseWrite)) router.refresh();
  }

  /** Valider une dépense automatique : elle compte côté client (livre, prix, facture) dès que le séjour est Visible. */
  async function validate(item: CrmBookingItem) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, validate: true }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Validation impossible.");
      return;
    }
    setLedgerNote(readLedgerWarning(json));
    onExpenseWrite?.({
      id: item.id,
      previousTitle: visibleServiceCopy(item.title),
      title: visibleServiceCopy(item.title),
      previousAmount: 0,
      amount: item.amount == null ? 0 : Number(item.amount),
      validated: true,
    });
    if (!onExpenseWrite) router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/bookings/${bookingId}/items?itemId=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Suppression impossible.");
      return;
    }
    setLedgerNote(readLedgerWarning(json));
    const current = expenses.find((item) => item.id === id);
    if (current) {
      onExpenseWrite?.({
        id,
        previousTitle: visibleServiceCopy(current.title),
        title: visibleServiceCopy(current.title),
        previousAmount: current.amount == null ? 0 : Number(current.amount),
        amount: 0,
        removed: true,
      });
    }
    if (editingId === id) setEditingId(null);
    if (!(current && onExpenseWrite)) router.refresh();
  }

  async function toggleCommission(enabled: boolean) {
    setCommissionOn(enabled);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agency_commission: enabled }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setCommissionOn(!enabled);
      setError(json.error || "Commission non enregistrée.");
      return;
    }
    router.refresh();
  }

  const commissionAmount = agencyFeeFromGross(agencyFeeBaseFromItems(items), agencyFeeRate);
  const commissionPercent = formatAgencyFeePercent(agencyFeeRate);

  const form = editingId ? (
    <div className="mt-3 space-y-3 rounded-2xl border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Libellé">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldControlClass}
            aria-label="Libellé de la dépense"
          />
        </Field>
        <div className="grid grid-cols-[5.5rem_1fr] gap-2">
          <Field label="Quantité">
            <input
              value={quantityText}
              onChange={(event) => changeQuantity(event.target.value)}
              inputMode="decimal"
              className={fieldControlClass}
              aria-label="Quantité"
            />
          </Field>
          <Field label="Prix unitaire">
            <MoneyInput value={unitPrice} onChange={changeUnitPrice} aria-label="Prix unitaire" />
          </Field>
        </div>
        <Field label="Montant">
          <MoneyInput value={amount} onChange={changeAmount} aria-label="Montant de la dépense" />
        </Field>
        <p className="self-end pb-2 text-xs text-muted">
          {quantity != null && unitPrice != null
            ? `${quantityText} × ${formatMoney(unitPrice, currency)} = ${formatMoney(cents(quantity * unitPrice), currency)}`
            : "Le montant vaut quantité × prix unitaire. Saisir le montant recalcule le prix unitaire."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : editingId === "new" ? "Ajouter la dépense" : "Enregistrer"}
        </button>
        <button type="button" className="text-sm font-semibold" onClick={() => setEditingId(null)}>
          Annuler
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="admin-af-card rounded-3xl p-5">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold">Dépenses</h2>
        <button
          type="button"
          className="admin-tap text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={beginNew}
        >
          Ajouter une dépense
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        {postsNow(visible)
          ? "Les frais de billeterie se créent ici dès qu’il y a un vol. Modifier ou retirer une ligne met à jour la transaction."
          : "Les frais de billeterie se créent ici dès qu’il y a un vol. Le débit part quand le séjour est visible."}
      </p>
      {presets.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[var(--admin-navy)]">Ajouter en un clic</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {presets.map((preset) => {
              const blocked = ticketingPresetBlocked(presets, preset.label, expenses);
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy || blocked}
                  title={blocked ? TICKETING_PRESET_BLOCKED : `Ajouter ${preset.label}`}
                  aria-label={
                    blocked
                      ? `${preset.label}, ${formatMoney(preset.amount, currency)}. ${TICKETING_PRESET_BLOCKED}`
                      : `Ajouter ${preset.label}, ${formatMoney(preset.amount, currency)}`
                  }
                  onClick={() => void addPreset(preset)}
                  className="admin-tap inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50 lg:min-h-0"
                >
                  {preset.label}
                  <span className="ml-1 font-normal text-muted">{formatMoney(preset.amount, currency)}</span>
                </button>
              );
            })}
          </div>
          {presets.some((preset) => ticketingPresetBlocked(presets, preset.label, expenses)) ? (
            <p className="mt-2 text-xs text-muted">{TICKETING_PRESET_BLOCKED}</p>
          ) : null}
        </div>
      ) : null}
      {awaitingCount ? (
        <p className="mt-1 text-xs font-semibold text-[#9e7e51]">
          {awaitingCount === 1
            ? "1 dépense Pliant à valider : cachée au client, hors prix, livre et facture jusqu’à Valider."
            : `${awaitingCount} dépenses Pliant à valider : cachées au client, hors prix, livre et facture jusqu’à Valider.`}
        </p>
      ) : null}
      <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)]">
        <input
          type="checkbox"
          className="mt-1"
          checked={commissionOn}
          disabled={busy}
          onChange={(event) => void toggleCommission(event.target.checked)}
        />
        <span>
          Appliquer la commission d’agence
          <span className="mt-0.5 block text-xs font-normal text-muted">
            {commissionPercent} des étapes et des dépenses de cette réservation. Une ligne dans les transactions, qui suit les ajouts et les retraits.
          </span>
        </span>
      </label>
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {commissionOn ? (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {AGENCY_FEE_LABEL} · {commissionPercent}
              <span className="ml-2 rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                Transactions
              </span>
            </p>
            <p className="text-xs text-muted">
              {formatMoney(commissionAmount, currency)}
              {" · "}
              Calculée sur les étapes et les dépenses
              {postsNow(visible) ? "" : " · débit quand le séjour est visible"}
            </p>
          </div>
        </div>
      ) : null}
      {expenses.length ? (
        <ul className="mt-2 space-y-2 text-sm">
          {expenses.map((item) =>
            editingId === item.id ? (
              <li key={item.id}>{form}</li>
            ) : (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">
                    {visibleServiceCopy(item.title)}
                    {expenseAwaitsValidation(item) ? (
                      <span className="ml-2 rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--admin-navy)]">
                        À valider · cachée au client
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[10px] font-bold uppercase">
                        Transactions
                      </span>
                    )}
                  </p>
                  <p className="break-words text-xs text-muted">
                    {item.amount != null ? formatMoney(Number(item.amount), currency) : "Montant manquant"}
                    {(() => {
                      const detail = expensePricingLabel(readExpensePricing(item.details, item.amount), (value) =>
                        formatMoney(value, currency)
                      );
                      return detail ? ` (${detail})` : "";
                    })()}
                    {" · "}
                    {isAutoTicketingExpense(item)
                      ? ticketingExpenseTouched(item.details)
                        ? "Montant modifié. La transaction suit cette ligne."
                        : "25 € par voyageur du dossier. Modifier ou retirer met à jour la transaction."
                      : "Absente de l’itinéraire"}
                  </p>
                  {(() => {
                    const origin = pliantExpenseOrigin(item.details, item.amount);
                    if (!origin) return null;
                    return (
                      <p className="break-words text-xs text-[#9e7e51]">
                        Carte Pliant
                        {origin.merchant ? ` · ${origin.merchant}` : ""}
                        {origin.date ? ` · ${formatDateFr(origin.date)}` : ""}
                        {origin.edited && origin.amount != null
                          ? ` · Montant modifié (Pliant : ${formatMoney(origin.amount, "EUR")})`
                          : " · Montant modifiable, la dépense Pliant ne change pas"}
                        {expenseAwaitsValidation(item) ? " · Hors prix, livre et facture tant qu’elle n’est pas validée" : ""}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 lg:shrink-0">
                  {expenseAwaitsValidation(item) ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="admin-af-btn admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs lg:min-h-0 disabled:opacity-50"
                      onClick={() => void validate(item)}
                    >
                      Valider · afficher au client
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-[var(--admin-navy)] lg:min-h-0"
                    onClick={() => beginEdit(item)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-accent lg:min-h-0"
                    onClick={() => void remove(item.id)}
                  >
                    Retirer
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      ) : commissionOn ? null : (
        <p className="mt-3 text-sm text-muted">Aucune dépense hors itinéraire.</p>
      )}
      {editingId === "new" ? form : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <LedgerWarningNotice message={ledgerNote} onDismiss={() => setLedgerNote(null)} className="mt-2" />
    </section>
  );
}
