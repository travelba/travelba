"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import {
  emptyPaymentTarget,
  paymentTargetReady,
  PaymentTargetFields,
  type PaymentTargetValue,
} from "@/components/admin/PaymentTargetFields";

/** Rattache un crédit déjà encaissé. Ne crée pas de paiement. */
export function AttachCreditButton({
  transactionId,
  customerId,
  label,
  amountLabel,
}: {
  transactionId: string;
  customerId: string;
  label: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PaymentTargetValue>(emptyPaymentTarget());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach() {
    if (!paymentTargetReady(target)) {
      setError("Choisissez le dossier et le payeur.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/rattacher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: target.bookingId,
          payer_kind: target.payerKind,
          billing_company_id: target.payerKind === "company" ? target.companyId : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Rattachement impossible.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-tap inline-flex items-center rounded-full border border-[var(--admin-gold)]/50 bg-[#f8f4ed] px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
      >
        Rattacher
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">Rattacher {amountLabel}</p>
      <p className="text-xs text-muted">Le crédit reste le même. Seuls le dossier et le payeur sont posés.</p>
      <PaymentTargetFields customerId={customerId} label={label} value={target} onChange={setTarget} disabled={saving} />
      <BusyBar active={saving} label="Rattachement…" />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void attach()}
          className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm"
        >
          {saving ? "Rattachement…" : "Rattacher"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setOpen(false)}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

export function UnattachedPaymentAlert({ count }: { count: number }) {
  if (count < 1) return null;
  const many = count > 1;
  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[var(--admin-navy)]"
    >
      <p className="font-semibold">Paiement à rattacher</p>
      <p className="mt-1 text-muted">
        {many ? `${count} paiements ne sont pas rattachés` : "Un paiement n’est pas rattaché"} à un dossier ni à un
        payeur. Le bouton Rattacher pose le dossier et le payeur, sans créer un nouveau crédit.
      </p>
    </div>
  );
}
