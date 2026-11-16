"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SelfServiceSettings } from "@/lib/crm/self-signup";

export function SelfServiceSetting({ settings }: { settings: SelfServiceSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [maxStay, setMaxStay] = useState(String(settings.maxStayCents / 100));
  const [searches, setSearches] = useState(String(settings.searchesPerHour));
  const [bookings, setBookings] = useState(String(settings.bookingsPerDay));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote("");
    const response = await fetch("/api/admin/hotels/autonomes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled,
        maxStayCents: Math.round(Number(maxStay) * 100),
        searchesPerHour: Number(searches),
        bookingsPerDay: Number(bookings),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    setBusy(false);
    if (!response.ok) {
      setNote(json.error || json.message || "Le réglage n’a pas été enregistré.");
      return;
    }
    setNote("Enregistré.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-8 max-w-xl space-y-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
      <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">Inscriptions autonomes</h3>
      <p className="text-sm text-muted">Ces plafonds ne concernent que les inscrits autonomes. Les clients invités ne changent pas.</p>
      <label className="flex items-center gap-2 text-sm text-[var(--admin-navy)]">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Réservations ouvertes
      </label>
      <label className="block text-sm text-[var(--admin-navy)]">
        Plafond d’un séjour (€)
        <input value={maxStay} onChange={(event) => setMaxStay(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-[#e5e3dc] px-3 py-2" />
      </label>
      <label className="block text-sm text-[var(--admin-navy)]">
        Recherches par heure
        <input value={searches} onChange={(event) => setSearches(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-[#e5e3dc] px-3 py-2" />
      </label>
      <label className="block text-sm text-[var(--admin-navy)]">
        Réservations par jour
        <input value={bookings} onChange={(event) => setBookings(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl border border-[#e5e3dc] px-3 py-2" />
      </label>
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
      <button type="submit" disabled={busy} className="h-10 rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60">
        Enregistrer
      </button>
    </form>
  );
}
