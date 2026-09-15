"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";

export function NewBookingForm({ customers }: { customers: CrmCustomer[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Erreur serveur (${res.status})`);
      router.push(`/admin/reservations/${json.booking.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-3">
      <select name="customer_id" required className="rounded-xl border border-border bg-white px-3 py-2.5">
        <option value="">Client…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.last_name} {c.first_name} — {c.email}
          </option>
        ))}
      </select>
      <input name="title" required placeholder="Titre du voyage" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="destination" placeholder="Destination" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="start_date" type="date" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="end_date" type="date" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      <input name="total_amount" type="number" step="0.01" placeholder="Montant" className="rounded-xl border border-border bg-white px-3 py-2.5" />
      {error ? <p role="alert" className="sm:col-span-3 text-sm text-accent">{error}</p> : null}
      <button disabled={pending} className="admin-af-btn rounded-xl px-4 py-2.5 text-sm sm:col-span-3 disabled:opacity-50">
        {pending ? "Création…" : "Créer la réservation"}
      </button>
    </form>
  );
}
