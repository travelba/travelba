"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceSettingsForm({
  iban,
  bic,
  holder,
  dueDays,
  revolut,
}: {
  iban: string;
  bic: string;
  holder: string;
  dueDays: string;
  revolut: "présent" | "absent" | "indisponible";
}) {
  const router = useRouter();
  const [ibanValue, setIban] = useState(iban);
  const [bicValue, setBic] = useState(bic);
  const [holderValue, setHolder] = useState(holder);
  const [dueValue, setDue] = useState(dueDays);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/reglages/facture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iban: ibanValue,
          bic: bicValue,
          holder: holderValue,
          due_days: dueValue,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "Le réglage n’a pas été enregistré.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Le réglage n’a pas été enregistré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-6 max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-[var(--admin-navy)]">
        {revolut === "présent"
          ? "Revolut fournit le RIB du compte euros Main. La saisie ci-dessous ne s’imprime que s’il manque."
          : revolut === "indisponible"
            ? "Revolut ne répond pas. Le RIB saisi ici est utilisé."
            : "Revolut ne fournit pas d’IBAN unique. Saisissez le RIB, ou laissez vide : la facture le dira."}
      </p>
      <label className="block text-sm font-semibold text-[var(--admin-navy)]">
        IBAN
        <input
          value={ibanValue}
          onChange={(event) => setIban(event.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold text-[var(--admin-navy)]">
        BIC
        <input
          value={bicValue}
          onChange={(event) => setBic(event.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold text-[var(--admin-navy)]">
        Titulaire
        <input
          value={holderValue}
          onChange={(event) => setHolder(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 font-normal"
        />
      </label>
      <label className="block text-sm font-semibold text-[var(--admin-navy)]">
        Échéance, en jours
        <input
          value={dueValue}
          onChange={(event) => setDue(event.target.value)}
          inputMode="numeric"
          placeholder="Vide : à réception"
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 font-normal"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-sm text-[var(--admin-navy)]">Réglage enregistré.</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="admin-tap rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
