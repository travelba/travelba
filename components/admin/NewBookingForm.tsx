"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { fieldControlClass } from "@/components/crm/fields";

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Erreur");
      return;
    }
    router.push(`/admin/reservations/${json.booking.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-3">
      <select name="customer_id" required className={`${fieldControlClass} bg-white`}>
        <option value="">Client…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.last_name} {c.first_name} — {c.email}
          </option>
        ))}
      </select>
      <input name="title" required placeholder="Titre du voyage" className={fieldControlClass} />
      <input name="destination" placeholder="Destination" className={fieldControlClass} />
      <input name="start_date" type="date" className={fieldControlClass} />
      <input name="end_date" type="date" className={fieldControlClass} />
      <input name="total_amount" type="number" step="0.01" placeholder="Montant" className={fieldControlClass} />
      {error ? <p className="sm:col-span-3 text-sm text-accent">{error}</p> : null}
      <button className="admin-af-btn rounded-xl px-4 py-2.5 text-sm sm:col-span-3">
        Créer la réservation
      </button>
    </form>
  );
}
