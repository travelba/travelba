"use client";

import { FormEvent, useState } from "react";

type Booking = { id: string; reference: string; title: string };

export function MtripCrmLinker({ guideId, status, appLinks, bookings }: {
  guideId: string;
  status: string;
  appLinks: Record<string, string>;
  bookings: Booking[];
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const links = Object.entries(appLinks || {});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/mtrip/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guide_id: guideId, booking_id: form.get("booking_id"), mobile_app_url: form.get("mobile_app_url") }) });
    const data = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Lien mTrip publié dans l’espace client." : data.error || "Association impossible");
  }
  return (
    <form onSubmit={submit} className="admin-af-card space-y-3 p-5">
      <h2 className="font-display text-lg font-bold">Publier dans le CRM client</h2>
      <p className="text-sm text-muted">Ce contrôle n’est disponible qu’après une publication mTrip réussie.</p>
      <select name="booking_id" required disabled={status !== "published"} className="w-full rounded-xl border border-border bg-white px-3 py-2"><option value="">Réservation CRM…</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.reference} · {booking.title}</option>)}</select>
      <select name="mobile_app_url" required disabled={status !== "published"} className="w-full rounded-xl border border-border bg-white px-3 py-2"><option value="">Voyageur / lien…</option>{links.map(([traveler, link]) => <option key={traveler} value={link}>{traveler}</option>)}</select>
      <button disabled={pending || status !== "published" || !links.length} className="admin-af-btn rounded-full px-4 py-2 text-sm disabled:opacity-50">{pending ? "Association…" : "Rendre le lien visible au client"}</button>
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
