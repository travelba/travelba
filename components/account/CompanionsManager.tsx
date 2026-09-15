"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion } from "@/lib/crm/types";

export function CompanionsManager({ companions }: { companions: CrmCompanion[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrmCompanion | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    if (editing) body.id = editing.id;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/client/companions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Impossible d’enregistrer ce compagnon.");
        return;
      }
      form.reset();
      setEditing(null);
      setSuccess(editing ? "Compagnon modifié." : "Compagnon ajouté.");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Retirer ce compagnon de votre profil ?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/client/companions?id=${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Impossible de retirer ce compagnon.");
        return;
      }
      if (editing?.id === id) setEditing(null);
      setSuccess("Compagnon retiré.");
      router.refresh();
    } catch {
      setError("Le service est momentanément indisponible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <ul className="space-y-2">
        {companions.map((c) => (
          <li
            key={c.id}
            className="admin-af-card flex items-center justify-between rounded-2xl px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {c.first_name} {c.last_name}
              </p>
              <p className="text-xs text-muted">
                {[c.relationship, c.nationality].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(c);
                  setError(null);
                  setSuccess(null);
                }}
                disabled={busy}
                className="text-xs font-semibold"
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={() => remove(c.id)}
                disabled={busy}
                className="text-xs font-semibold text-accent"
              >
                Retirer
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form
        key={editing?.id || "new"}
        onSubmit={onSubmit}
        className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2"
      >
        <h2 className="font-display font-bold sm:col-span-2">
          {editing ? "Modifier le compagnon" : "Ajouter un compagnon"}
        </h2>
        <input name="first_name" required defaultValue={editing?.first_name} placeholder="Prénom" className="rounded-xl border border-border px-3 py-2" />
        <input name="last_name" required defaultValue={editing?.last_name} placeholder="Nom" className="rounded-xl border border-border px-3 py-2" />
        <input name="relationship" defaultValue={editing?.relationship || ""} placeholder="Lien (conjoint, enfant…)" className="rounded-xl border border-border px-3 py-2" />
        <input name="nationality" defaultValue={editing?.nationality || ""} placeholder="Nationalité" className="rounded-xl border border-border px-3 py-2" />
        <input name="birth_date" type="date" defaultValue={editing?.birth_date || ""} className="rounded-xl border border-border px-3 py-2" />
        {error ? <p className="sm:col-span-2 text-sm text-accent">{error}</p> : null}
        {success ? <p className="sm:col-span-2 text-sm text-emerald-700">{success}</p> : null}
        <div className="flex gap-2 sm:col-span-2">
          <button disabled={busy} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-60">
            {busy ? "Enregistrement…" : editing ? "Enregistrer les modifications" : "Ajouter un compagnon"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            >
              Annuler
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
