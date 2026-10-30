"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

/** Seuils d’alerte. Information seulement : rien n’est bloqué, aucun plafond. */
export function AgencyLimitsForm({
  paymentEuros,
  failedLogins,
  preview = false,
}: {
  paymentEuros: number;
  failedLogins: number;
  preview?: boolean;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState(String(paymentEuros));
  const [failed, setFailed] = useState(String(failedLogins));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (preview) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/equipe/droits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_euros: Number(payment),
          failed_logins: Number(failed),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card space-y-4 rounded-2xl p-5">
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Alertes</p>
      <p className="text-sm text-muted">
        Les administrateurs sont prévenus d’un passeport ou d’une carte ouverts, d’un paiement au-dessus du seuil, d’un
        remboursement, d’un changement de rôle et de connexions refusées. Rien n’est bloqué, aucun plafond.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Alerte paiement à partir de (€)
          <input value={payment} onChange={(event) => setPayment(event.target.value)} inputMode="numeric" className="admin-af-input text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Connexions refusées en quinze minutes
          <input value={failed} onChange={(event) => setFailed(event.target.value)} inputMode="numeric" className="admin-af-input text-sm" />
        </label>
      </div>
      <button type="submit" disabled={saving || preview} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-60">
        {saving ? "Enregistrement…" : "Enregistrer les seuils"}
      </button>
      <BusyBar active={saving} label="Enregistrement des seuils…" />
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-[var(--admin-navy)]">Seuils enregistrés.</p> : null}
    </form>
  );
}
