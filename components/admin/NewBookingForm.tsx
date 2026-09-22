"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { fieldControlClass, DateFrInput } from "@/components/crm/fields";

export function NewBookingForm({
  customers,
  aiConfigured,
}: {
  customers: CrmCustomer[];
  aiConfigured: boolean;
}) {
  const [manual, setManual] = useState(false);

  return (
    <div className="space-y-3">
      <BookingIngest
        role="admin"
        mode="create"
        customers={customers}
        ingestUrl="/api/admin/bookings/ingest"
        saveUrl="/api/admin/bookings/from-ingest"
        aiConfigured={aiConfigured}
        redirectTo={(booking) => `/admin/reservations/${booking.id}`}
      />
      <button
        type="button"
        className="text-xs font-semibold text-[var(--admin-navy)] underline"
        onClick={() => setManual((v) => !v)}
      >
        {manual ? "Masquer la saisie manuelle" : "Saisie manuelle (sans document)"}
      </button>
      {manual ? <ManualNewBookingForm customers={customers} /> : null}
    </div>
  );
}

function ManualNewBookingForm({ customers }: { customers: CrmCustomer[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Création impossible. Réessayez.");
        return;
      }
      router.push(`/admin/reservations/${json.booking.id}`);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "flex flex-col gap-1 text-xs font-semibold text-muted";

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-3">
      <label className={`${labelClass} sm:col-span-3`}>
        Client
        <select name="customer_id" required disabled={saving} className={`${fieldControlClass} bg-white`}>
          <option value="">Choisir un client…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.last_name} {c.first_name} — {c.email}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Titre du voyage
        <input name="title" required disabled={saving} placeholder="Ex. Séjour à Bali" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Destination
        <input name="destination" disabled={saving} placeholder="Ville, pays" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Montant total (€)
        <input name="total_amount" type="number" step="0.01" min="0" disabled={saving} placeholder="0,00" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Départ
        <DateFrInput name="start_date" aria-label="Date de départ" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Retour
        <DateFrInput name="end_date" aria-label="Date de retour" className={fieldControlClass} />
      </label>
      {error ? <p className="sm:col-span-3 text-sm text-accent">{error}</p> : null}
      <button type="submit" disabled={saving} className="admin-af-btn rounded-xl px-4 py-2.5 text-sm sm:col-span-3">
        {saving ? "Création…" : "Créer la réservation"}
      </button>
    </form>
  );
}
