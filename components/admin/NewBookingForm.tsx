"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmCustomer } from "@/lib/crm/types";
import { BookingIngest } from "@/components/crm/BookingIngest";
import { fieldControlClass, DateFrInput } from "@/components/crm/fields";
import { BusyBar } from "@/components/crm/BusyBar";
import { IssuesList } from "@/components/crm/IssuesList";
import { issuesFromResponse, type BookingIssue } from "@/lib/crm/booking-issues";

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
  const [issues, setIssues] = useState<BookingIssue[]>([]);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          include_in_ledger: fd.get("include_in_ledger") === "on",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIssues(issuesFromResponse(json));
        setError(null);
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
              {c.company_role === "member" ? " · rattaché" : ""}
              {c.company_role === "admin" ? " · admin société" : ""}
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
      <p className="text-xs text-muted sm:col-span-3">
        Le montant du séjour sera la somme des prix vendus des cartes.
      </p>
      <label className="flex items-start gap-2 text-sm font-semibold text-[var(--admin-navy)] sm:col-span-3">
        <input type="checkbox" name="include_in_ledger" defaultChecked className="mt-1" disabled={saving} />
        <span>
          Inclure le montant du séjour dans les transactions
          <span className="mt-0.5 block text-xs font-normal text-muted">
            Décochez pour un dossier au carnet sans écriture à l’encours.
          </span>
        </span>
      </label>
      <label className={labelClass}>
        Départ
        <DateFrInput name="start_date" aria-label="Date de départ" className={fieldControlClass} />
      </label>
      <label className={labelClass}>
        Retour
        <DateFrInput name="end_date" aria-label="Date de retour" className={fieldControlClass} />
      </label>
      <div className="sm:col-span-3">
        <IssuesList issues={issues} />
        {error && !issues.length ? <p className="text-sm text-accent">{error}</p> : null}
      </div>
      <div className="sm:col-span-3">
        <BusyBar active={saving} label="Création…" />
      </div>
      <button type="submit" disabled={saving} className="admin-af-btn rounded-xl px-4 py-2.5 text-sm sm:col-span-3">
        {saving ? "Création…" : "Créer la réservation"}
      </button>
    </form>
  );
}
