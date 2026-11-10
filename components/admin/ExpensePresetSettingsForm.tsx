"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { Field, MoneyInput, fieldControlClass } from "@/components/crm/fields";
import type { ExpensePreset } from "@/lib/crm/expense-presets";

type Row = {
  key: string;
  id: string | null;
  label: string;
  amount: number | null;
  active: boolean;
  guard: boolean;
};

function toRows(presets: ExpensePreset[]): Row[] {
  return presets.map((preset) => ({
    key: preset.id,
    id: preset.id.startsWith("default:") ? null : preset.id,
    label: preset.label,
    amount: preset.amount,
    active: preset.active,
    guard: preset.guard === "ticketing",
  }));
}

/** Liste des raccourcis. Enregistrer remplace le catalogue, pas les dépenses déjà posées. */
export function ExpensePresetSettingsForm({ presets }: { presets: ExpensePreset[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(presets));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function patch(key: string, next: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
    setSaved(false);
  }

  function move(key: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/reglages/depenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          presets: rows.map((row) => ({
            id: row.id,
            label: row.label,
            amount: row.amount,
            active: row.active,
            guard: row.guard ? "ticketing" : null,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; presets?: ExpensePreset[] } | null;
      if (!res.ok) {
        setError(json?.error || "Le réglage n’a pas été enregistré.");
        return;
      }
      if (json?.presets) setRows(toRows(json.presets));
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
      className="mt-6 max-w-2xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <BusyBar active={busy} label="Enregistrement…" />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.key} className="rounded-2xl border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                <Field label="Libellé">
                  <input
                    value={row.label}
                    onChange={(event) => patch(row.key, { label: event.target.value })}
                    className={fieldControlClass}
                    aria-label={`Libellé ${index + 1}`}
                  />
                </Field>
                <Field label="Montant">
                  <MoneyInput
                    value={row.amount}
                    onChange={(amount) => patch(row.key, { amount })}
                    aria-label={`Montant ${index + 1}`}
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2 font-semibold text-[var(--admin-navy)]">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => patch(row.key, { active: event.target.checked })}
                  />
                  Proposé sur les dossiers
                </label>
                <label className="flex items-center gap-2 font-semibold text-[var(--admin-navy)]">
                  <input
                    type="checkbox"
                    checked={row.guard}
                    onChange={(event) => patch(row.key, { guard: event.target.checked })}
                  />
                  Déjà couvert par les frais de billeterie automatiques
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                <button type="button" className="admin-tap text-[var(--admin-navy)]" onClick={() => move(row.key, -1)} disabled={index === 0}>
                  Monter
                </button>
                <button
                  type="button"
                  className="admin-tap text-[var(--admin-navy)]"
                  onClick={() => move(row.key, 1)}
                  disabled={index === rows.length - 1}
                >
                  Descendre
                </button>
                <button
                  type="button"
                  className="admin-tap text-accent"
                  onClick={() => {
                    setRows((current) => current.filter((item) => item.key !== row.key));
                    setSaved(false);
                  }}
                >
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun raccourci. Les dossiers n’en proposent plus.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="admin-tap rounded-full border border-border px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
          onClick={() => {
            setRows((current) => [
              ...current,
              { key: `new-${current.length}-${Date.now()}`, id: null, label: "", amount: null, active: true, guard: false },
            ]);
            setSaved(false);
          }}
        >
          Ajouter un raccourci
        </button>
        <button type="submit" disabled={busy} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {saved ? <p className="text-sm text-[var(--admin-navy)]">Raccourcis enregistrés.</p> : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </form>
  );
}
