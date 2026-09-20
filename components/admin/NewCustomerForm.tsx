"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const fieldClass = "rounded-xl border border-border bg-white px-3 py-2.5";
const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

export function NewCustomerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Création impossible. Réessayez.");
        return;
      }
      router.push(`/admin/clients/${json.customer.id}`);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-4">
      <label className={labelClass}>
        Prénom
        <input name="first_name" required autoComplete="off" disabled={saving} className={fieldClass} />
      </label>
      <label className={labelClass}>
        Nom
        <input name="last_name" required autoComplete="off" disabled={saving} className={fieldClass} />
      </label>
      <label className={labelClass}>
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          disabled={saving}
          placeholder="client@exemple.fr"
          className={fieldClass}
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="admin-af-btn self-end rounded-full px-4 py-2.5 text-sm"
      >
        {saving ? "Création…" : "Créer"}
      </button>
      {error ? <p className="text-sm text-accent sm:col-span-4">{error}</p> : null}
    </form>
  );
}
