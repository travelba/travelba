"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AgencyHotelContact } from "@/lib/agency/types";

export default function HotelContactsPage() {
  const [contacts, setContacts] = useState<AgencyHotelContact[]>([]);
  const [leHotelId, setLeHotelId] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [emails, setEmails] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/hotel-contacts");
    const data = await res.json();
    if (res.ok) setContacts(data.contacts || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/hotel-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        le_hotel_id: Number(leHotelId),
        hotel_name: hotelName || null,
        emails: emails
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        phone: phone || null,
        notes: notes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Enregistrement impossible");
      return;
    }
    setLeHotelId("");
    setHotelName("");
    setEmails("");
    setPhone("");
    setNotes("");
    await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Contacts hôtels</h1>
        <p className="mt-1 text-sm text-muted">
          Carnet manuel (l&apos;API Little Emperors ne fournit pas les emails).
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-border bg-surface/50 p-5 sm:grid-cols-2"
      >
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">ID hôtel Little Emperors</span>
          <input
            required
            type="number"
            value={leHotelId}
            onChange={(e) => setLeHotelId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">Nom hôtel</span>
          <input
            value={hotelName}
            onChange={(e) => setHotelName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm sm:col-span-2">
          <span className="text-muted">Emails</span>
          <input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="a@hotel.com, b@hotel.com"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">Téléphone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>
        {error ? <p className="text-sm text-accent-3 sm:col-span-2">{error}</p> : null}
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white sm:col-span-2 sm:w-fit"
        >
          Enregistrer
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2/60 text-muted">
            <tr>
              <th className="px-4 py-3">Hôtel</th>
              <th className="px-4 py-3">Emails</th>
              <th className="px-4 py-3">Téléphone</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {contact.hotel_name || `Hôtel #${contact.le_hotel_id}`}
                  </p>
                  <p className="text-xs text-muted">LE #{contact.le_hotel_id}</p>
                </td>
                <td className="px-4 py-3 text-muted">
                  {contact.emails?.join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-muted">{contact.phone || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
