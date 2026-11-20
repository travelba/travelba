"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { LedgerWarningNotice } from "@/components/crm/LedgerWarningNotice";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import {
  discountLineEuros,
  marginAfterCommercialDiscount,
  priceDiscountLines,
  type CommercialDiscountType,
  type DiscountLine,
} from "@/lib/crm/commercial-discount";
import { readLedgerWarning } from "@/lib/crm/ledger-warning";
import { formatMoney } from "@/lib/crm/money";

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function quantityLabel(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 3, useGrouping: false });
}

export function BookingDiscountPanel({
  bookingId,
  currency = "EUR",
  gross,
  net,
  margin,
  lines,
  tableReady = false,
  onLines,
  onArgentRefresh,
}: {
  bookingId: string;
  currency?: string;
  /** Total TTC avant remise : cartes, commission, frais. */
  gross: number;
  net?: number | null;
  /** Marge affichée, déjà diminuée des remises enregistrées. */
  margin?: number | null;
  lines: DiscountLine[];
  /** Faux : la table n’est pas encore là. L’ajout le dit. */
  tableReady?: boolean;
  onLines?: (lines: DiscountLine[]) => void;
  onArgentRefresh?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<CommercialDiscountType>("amount");
  const [title, setTitle] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [percentText, setPercentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerNote, setLedgerNote] = useState<string | null>(null);
  const quantity = Number(quantityText.trim().replace(",", "."));
  const percent = Number(percentText.trim().replace(",", "."));
  const draftQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const draftPercent = Number.isFinite(percent) ? percent : 0;
  const draftEuros = discountLineEuros(gross, {
    kind,
    quantity: draftQuantity,
    unitPrice,
    percent: draftPercent,
  });
  const priced = priceDiscountLines(gross, lines);
  const cut = priced.total;
  const total = Math.round((gross - cut) * 100) / 100;
  const inEuros = (currency || "EUR").toUpperCase() === "EUR";
  const marginNow = margin == null ? null : margin;
  const alert =
    inEuros && net != null && marginNow != null && cut > 0
      ? marginAfterCommercialDiscount({ margin: marginNow + cut, net, discountEuros: cut })
      : null;

  function beginNew() {
    setEditingId("new");
    setKind("amount");
    setTitle("");
    setQuantityText("1");
    setUnitPrice(null);
    setPercentText("");
    setError(null);
  }

  function beginEdit(line: DiscountLine) {
    setEditingId(line.id);
    setKind(line.kind);
    setTitle(line.label);
    setQuantityText(quantityLabel(line.quantity));
    setUnitPrice(line.unitPrice);
    setPercentText(line.percent != null ? String(line.percent).replace(".", ",") : "");
    setError(null);
  }

  function changeQuantity(text: string) {
    setQuantityText(text);
  }

  function changeUnitPrice(next: number | null) {
    setUnitPrice(next);
  }

  function changeAmount(next: number | null) {
    if (next != null && draftQuantity > 0) setUnitPrice(cents(next / draftQuantity));
    else setUnitPrice(next);
  }

  async function persist(method: "POST" | "PATCH" | "DELETE", body?: unknown, lineId?: string) {
    setBusy(true);
    setError(null);
    const url =
      method === "DELETE"
        ? `/api/admin/bookings/${bookingId}/discounts?lineId=${encodeURIComponent(lineId || "")}`
        : `/api/admin/bookings/${bookingId}/discounts`;
    const res = await fetch(url, {
      method,
      headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Remise non enregistrée.");
      return null;
    }
    setLedgerNote(readLedgerWarning(json));
    return json as { line?: DiscountLine };
  }

  async function save() {
    const label = title.trim();
    if (!label) {
      setError("Libellé requis.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantité invalide (un nombre supérieur à zéro).");
      return;
    }
    const payload = {
      label,
      kind,
      quantity,
      unit_price: kind === "amount" ? unitPrice : null,
      percent: kind === "percent" ? percentText.trim().replace(",", ".") : null,
      amount: kind === "amount" && unitPrice == null ? null : undefined,
    };
    if (kind === "amount" && (unitPrice == null || unitPrice <= 0)) {
      setError("Montant requis.");
      return;
    }
    if (kind === "percent" && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
      setError(Number.isFinite(percent) && percent > 100 ? "Le pourcentage est compris entre 0 et 100." : "Indiquez le pourcentage.");
      return;
    }
    const json = await persist(editingId && editingId !== "new" ? "PATCH" : "POST", {
      ...payload,
      ...(editingId && editingId !== "new" ? { id: editingId } : {}),
    });
    if (!json?.line) return;
    const next =
      editingId && editingId !== "new"
        ? lines.map((line) => (line.id === editingId ? json.line! : line))
        : [...lines, json.line];
    onLines?.(next);
    setEditingId(null);
    await onArgentRefresh?.();
    router.refresh();
  }

  async function remove(id: string) {
    const json = await persist("DELETE", undefined, id);
    if (!json) return;
    onLines?.(lines.filter((line) => line.id !== id));
    if (editingId === id) setEditingId(null);
    await onArgentRefresh?.();
    router.refresh();
  }

  const form = editingId ? (
    <div className="mt-3 space-y-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Type de remise">
        {(
          [
            ["amount", "Montant (€)"],
            ["percent", "Pourcentage (%)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setError(null);
            }}
            className={`admin-tap inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold lg:min-h-0 ${
              kind === value
                ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white"
                : "border-border text-[var(--admin-navy)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Libellé">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldControlClass}
            aria-label="Libellé de la remise"
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
          {kind === "amount" ? (
            <Field label="Prix unitaire">
              <MoneyInput value={unitPrice} onChange={changeUnitPrice} aria-label="Prix unitaire" />
            </Field>
          ) : (
            <Field label="Pourcentage">
              <input
                value={percentText}
                onChange={(event) => setPercentText(event.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal"
                className={fieldControlClass}
                aria-label="Pourcentage de la remise"
                placeholder="0"
              />
            </Field>
          )}
        </div>
        <Field label="Montant">
          <MoneyInput
            value={draftEuros > 0 ? draftEuros : null}
            onChange={kind === "amount" ? changeAmount : () => undefined}
            aria-label="Montant de la remise"
            disabled={kind === "percent"}
          />
        </Field>
        <p className="self-end pb-2 text-xs text-muted">
          {kind === "percent"
            ? draftQuantity > 0 && draftPercent > 0
              ? `${quantityText} × ${String(draftPercent).replace(".", ",")} % de ${formatMoney(gross, currency)} = ${formatMoney(draftEuros, currency)}`
              : "Le pourcentage remplace le prix unitaire. Le montant est une part de la vente du voyage."
            : draftQuantity > 0 && unitPrice != null
              ? `${quantityText} × ${formatMoney(unitPrice, currency)} = ${formatMoney(cents(draftQuantity * unitPrice), currency)}`
              : "Le montant vaut quantité × prix unitaire."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : editingId === "new" ? "Ajouter la remise" : "Enregistrer"}
        </button>
        <button type="button" className="text-sm font-semibold" onClick={() => setEditingId(null)}>
          Annuler
        </button>
      </div>
    </div>
  ) : null;

  return (
    <section className="admin-af-card mt-4 rounded-3xl p-5" aria-label="Remise commerciale">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold">Remise commerciale</h2>
        <button
          type="button"
          className="admin-tap text-xs font-semibold text-[var(--admin-navy)] underline"
          onClick={beginNew}
        >
          Ajouter une remise
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Plusieurs lignes, hors itinéraire. Un montant est quantité × prix unitaire. Un pourcentage remplace le prix unitaire et retire cette part de la vente du voyage, après les commissions et les frais.
      </p>
      {!tableReady ? (
        <p className="mt-2 text-xs text-muted">L’ajout attend la migration des remises. La remise déjà saisie sur le dossier reste affichée.</p>
      ) : null}
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      {lines.length ? (
        <ul className="mt-2 space-y-2 text-sm">
          {priced.lines.map((line) =>
            editingId === line.id ? (
              <li key={line.id}>{form}</li>
            ) : (
              <li
                key={line.id}
                className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{line.label}</p>
                  <p className="break-words text-xs text-muted">
                    {formatMoney(-line.euros, currency)}
                    {line.kind === "percent"
                      ? ` · ${quantityLabel(line.quantity)} × ${String(line.percent ?? 0).replace(".", ",")} % de la vente`
                      : line.quantity === 1
                        ? ""
                        : ` · ${quantityLabel(line.quantity)} × ${formatMoney(line.unitPrice || 0, currency)}`}
                  </p>
                </div>
                {tableReady ? (
                  <div className="flex items-center gap-2 lg:shrink-0">
                    <button
                      type="button"
                      className="admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-[var(--admin-navy)] lg:min-h-0"
                      onClick={() => beginEdit(line)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-accent lg:min-h-0"
                      onClick={() => void remove(line.id)}
                    >
                      Retirer
                    </button>
                  </div>
                ) : null}
              </li>
            )
          )}
        </ul>
      ) : editingId === "new" ? null : (
        <p className="mt-3 text-sm text-muted">Aucune remise.</p>
      )}
      {editingId === "new" ? form : null}
      <p className="mt-3 text-sm text-[var(--admin-navy)]">
        {cut > 0
          ? `Remises de ${formatMoney(cut, currency)} sur ${formatMoney(gross, currency)}. Total après remises : ${formatMoney(total, currency)}.`
          : `Total sans remise : ${formatMoney(gross, currency)}.`}
      </p>
      {alert?.belowFloor ? (
        <p role="status" className="mt-3 rounded-xl border border-[#e7c98a] bg-[#fbf6ee] px-3 py-2 text-sm text-[#6f552c]">
          La marge après remise passe sous 12 % du net ({formatMoney(alert.margin, "EUR")} pour un plancher de{" "}
          {formatMoney(alert.floor || 0, "EUR")}). Ce n’est qu’un avertissement.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
      <LedgerWarningNotice message={ledgerNote} onDismiss={() => setLedgerNote(null)} className="mt-2" />
    </section>
  );
}
