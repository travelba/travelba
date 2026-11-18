"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import {
  commercialDiscountAmount,
  marginAfterCommercialDiscount,
  readCommercialDiscount,
  type CommercialDiscountType,
} from "@/lib/crm/commercial-discount";
import { formatMoney } from "@/lib/crm/money";

export function BookingDiscountPanel({
  bookingId,
  currency = "EUR",
  remiseType,
  remiseValue,
  gross,
  net,
  margin,
  remiseApplied = 0,
  onArgentRefresh,
}: {
  bookingId: string;
  currency?: string;
  remiseType?: string | null;
  remiseValue?: number | string | null;
  /** Total TTC avant remise : cartes, commission, frais. */
  gross: number;
  /** Net fournisseur déjà pointé. Null : pas d’alerte de marge. */
  net?: number | null;
  /** Marge affichée, déjà diminuée de la remise enregistrée. */
  margin?: number | null;
  remiseApplied?: number;
  onArgentRefresh?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const saved = readCommercialDiscount({ remise_type: remiseType, remise_value: remiseValue });
  const [type, setType] = useState<CommercialDiscountType>(saved.type || "amount");
  const [amount, setAmount] = useState<number | null>(saved.type === "amount" ? saved.value : null);
  const [percentText, setPercentText] = useState(saved.type === "percent" && saved.value != null ? String(saved.value).replace(".", ",") : "");
  const [synced, setSynced] = useState(`${remiseType ?? ""}:${remiseValue ?? ""}`);
  const signature = `${remiseType ?? ""}:${remiseValue ?? ""}`;
  if (synced !== signature) {
    setSynced(signature);
    setType(saved.type || "amount");
    setAmount(saved.type === "amount" ? saved.value : null);
    setPercentText(saved.type === "percent" && saved.value != null ? String(saved.value).replace(".", ",") : "");
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const percent = Number(percentText.trim().replace(",", "."));
  const draftValue = type === "percent" ? (Number.isFinite(percent) ? percent : 0) : amount;
  const draft = { type: draftValue != null && draftValue > 0 ? type : null, value: draftValue };
  const cut = commercialDiscountAmount(gross, draft.type ? draft : null);
  const total = Math.round((gross - cut) * 100) / 100;
  const inEuros = (currency || "EUR").toUpperCase() === "EUR";
  const marginNow = margin == null ? null : margin - (cut - remiseApplied);
  const alert =
    inEuros && net != null && marginNow != null && cut > 0
      ? marginAfterCommercialDiscount({ margin: marginNow + cut, net, discountEuros: cut })
      : null;

  async function save(next: { remise_type: string | null; remise_value: number | null }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Remise non enregistrée.");
      return;
    }
    await onArgentRefresh?.();
    router.refresh();
  }

  function submit() {
    if (type === "percent" && percentText.trim() && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      setError("Le pourcentage est compris entre 0 et 100.");
      return;
    }
    if (type === "amount" && amount != null && amount < 0) {
      setError("La remise ne peut pas être négative.");
      return;
    }
    const value = type === "percent" ? (Number.isFinite(percent) ? percent : 0) : amount;
    if (value == null || value <= 0) {
      void save({ remise_type: null, remise_value: null });
      return;
    }
    void save({ remise_type: type, remise_value: Math.round(value * 100) / 100 });
  }

  return (
    <section className="admin-af-card mt-4 rounded-3xl p-5" aria-label="Remise commerciale">
      <h2 className="font-display text-lg font-bold">Remise commerciale</h2>
      <p className="mt-1 text-xs text-muted">
        En montant ou en pourcentage, sur le total TTC, après les commissions et les frais. Elle réduit le prix facturé au client.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Type de remise">
        {(
          [
            ["amount", "Montant (€)"],
            ["percent", "Pourcentage (%)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={type === value}
            onClick={() => {
              setType(value);
              setError(null);
            }}
            className={`admin-tap inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-semibold lg:min-h-0 ${
              type === value
                ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white"
                : "border-border text-[var(--admin-navy)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 max-w-xs">
        {type === "amount" ? (
          <Field label="Montant de la remise">
            <MoneyInput value={amount} onChange={setAmount} aria-label="Montant de la remise" />
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
      <p className="mt-3 text-sm text-[var(--admin-navy)]">
        {cut > 0
          ? `Remise de ${formatMoney(cut, currency)} sur ${formatMoney(gross, currency)}. Total après remise : ${formatMoney(total, currency)}.`
          : `Total sans remise : ${formatMoney(gross, currency)}.`}
      </p>
      {alert?.belowFloor ? (
        <p role="status" className="mt-3 rounded-xl border border-[#e7c98a] bg-[#fbf6ee] px-3 py-2 text-sm text-[#6f552c]">
          La marge après remise passe sous 12 % du net ({formatMoney(alert.margin, "EUR")} pour un plancher de{" "}
          {formatMoney(alert.floor || 0, "EUR")}). Ce n’est qu’un avertissement.
        </p>
      ) : null}
      <div className="mt-3">
        <BusyBar active={busy} label="Enregistrement…" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer la remise"}
        </button>
        {saved.type ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ remise_type: null, remise_value: null })}
            className="admin-tap inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-accent lg:min-h-0"
          >
            Retirer la remise
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </section>
  );
}
