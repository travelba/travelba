"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewCustomerForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Erreur serveur (${res.status})`);
      router.push(`/admin/clients/${json.customer.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-4">
      <input name="first_name" placeholder="Prénom" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="last_name" placeholder="Nom" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="email" type="email" required placeholder="Email" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <button disabled={pending} className="admin-af-btn rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
        {pending ? "Création…" : "Créer le client"}
      </button>
      {error ? <p role="alert" className="sm:col-span-4 text-sm text-accent">{error}</p> : null}
    </form>
  );
}
