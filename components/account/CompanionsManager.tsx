"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCompanion } from "@/lib/crm/types";

export function CompanionsManager({ companions }: { companions: CrmCompanion[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/client/companions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      return;
    }
    form.reset();
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/client/companions?id=${id}`, { method: "DELETE" });
    router.refresh();
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
            <button
              type="button"
              onClick={() => remove(c.id)}
              className="text-xs font-semibold text-accent"
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-3xl p-5 sm:grid-cols-2">
        <input name="first_name" required placeholder="Prénom" className="rounded-xl border border-border px-3 py-2" />
        <input name="last_name" required placeholder="Nom" className="rounded-xl border border-border px-3 py-2" />
        <input name="relationship" placeholder="Lien (conjoint, enfant…)" className="rounded-xl border border-border px-3 py-2" />
        <input name="nationality" placeholder="Nationalité" className="rounded-xl border border-border px-3 py-2" />
        <input name="birth_date" type="date" className="rounded-xl border border-border px-3 py-2" />
        {error ? <p className="sm:col-span-2 text-sm text-accent">{error}</p> : null}
        <button className="admin-af-btn rounded-full px-4 py-2 text-sm sm:col-span-2">
          Ajouter un compagnon
        </button>
      </form>
    </div>
  );
}
