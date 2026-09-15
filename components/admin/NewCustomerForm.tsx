"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewCustomerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      return;
    }
    router.push(`/admin/clients/${json.customer.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-4">
      <input name="first_name" placeholder="Prénom" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="last_name" placeholder="Nom" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="email" type="email" required placeholder="Email" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <button className="admin-af-btn rounded-xl px-4 py-2.5 text-sm">Créer le client</button>
      {error ? <p className="sm:col-span-4 text-sm text-accent">{error}</p> : null}
    </form>
  );
}
