"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

export function AgencyLimitsForm({
  ceilingEuros,
  paymentEuros,
  failedLogins,
  preview = false,
}: {
  ceilingEuros: number;
  paymentEuros: number;
  failedLogins: number;
  preview?: boolean;
}) {
  const router = useRouter();
  const [ceiling, setCeiling] = useState(String(ceilingEuros));
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
          ceiling_euros: Number(ceiling),
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
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Plafonds</p>
      <p className="text-sm text-muted">
        Un agent ne crée pas de carte Pliant au-dessus du plafond. Une sortie plus haute prévient les administrateurs.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Plafond carte agent (€)
          <input value={ceiling} onChange={(event) => setCeiling(event.target.value)} inputMode="numeric" className="admin-af-input text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Alerte paiement (€)
          <input value={payment} onChange={(event) => setPayment(event.target.value)} inputMode="numeric" className="admin-af-input text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Connexions refusées
          <input value={failed} onChange={(event) => setFailed(event.target.value)} inputMode="numeric" className="admin-af-input text-sm" />
        </label>
      </div>
      <button type="submit" disabled={saving || preview} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-60">
        {saving ? "Enregistrement…" : "Enregistrer les plafonds"}
      </button>
      <BusyBar active={saving} label="Enregistrement des plafonds…" />
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {saved ? <p className="text-sm font-semibold text-[var(--admin-navy)]">Plafonds enregistrés.</p> : null}
    </form>
  );
}
