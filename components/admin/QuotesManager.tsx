"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Quote = { id: string; reference: string; title: string; status: string; currency: string; valid_until: string | null; customer_id: string };
type Customer = { id: string; first_name: string; last_name: string; email: string };

export function QuotesManager({ initialQuotes, customers }: { initialQuotes: Quote[]; customers: Customer[] }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage(null);
    const form = new FormData(formElement);
    const response = await fetch("/api/admin/operations/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: form.get("customer_id"),
        reference: form.get("reference"),
        title: form.get("title"),
        currency: "EUR",
        valid_until: form.get("valid_until") || null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(data.error || "Création impossible");
    setQuotes((rows) => [data.item, ...rows]);
    formElement.reset();
    setMessage("Devis créé.");
  }

  async function remove(quote: Quote) {
    if (!window.confirm(`Supprimer le devis ${quote.reference} ?`)) return;
    const response = await fetch(`/api/admin/operations/quotes?id=${quote.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || "Suppression impossible");
    setQuotes((rows) => rows.filter((row) => row.id !== quote.id));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        {quotes.map((quote) => (
          <article key={quote.id} className="admin-af-card flex items-center justify-between gap-4 p-5">
            <Link href={`/admin/devis/${quote.id}`} className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">{quote.title}</p>
              <p className="text-sm text-muted">{quote.reference} · {quote.status}</p>
            </Link>
            <button type="button" onClick={() => void remove(quote)} className="text-xs font-semibold text-red-700">Supprimer</button>
          </article>
        ))}
      </div>
      <form onSubmit={create} className="admin-af-card h-fit space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">Nouveau devis</h2>
        <select name="customer_id" required className="w-full rounded-xl border border-border bg-white px-3 py-2">
          <option value="">Sélectionner un client</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name} · {customer.email}</option>)}
        </select>
        <input name="reference" required placeholder="Référence (ex. DEV-2026-001)" className="w-full rounded-xl border border-border bg-white px-3 py-2" />
        <input name="title" required placeholder="Titre du voyage" className="w-full rounded-xl border border-border bg-white px-3 py-2" />
        <label className="block text-sm font-semibold">Validité<input name="valid_until" type="date" className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-normal" /></label>
        {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
        <button disabled={pending} className="admin-af-btn w-full rounded-full px-4 py-2.5 text-sm disabled:opacity-50">{pending ? "Création…" : "Créer"}</button>
      </form>
    </div>
  );
}
