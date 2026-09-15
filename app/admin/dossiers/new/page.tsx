"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgencyClient, AgencyRoomOccupancy } from "@/lib/agency/types";
import type { PredictiveSearchItem } from "@/lib/little-emperors/types";

export default function NewDossierPage() {
  const router = useRouter();
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PredictiveSearchItem[]>([]);
  const [selected, setSelected] = useState<PredictiveSearchItem | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [rooms, setRooms] = useState<AgencyRoomOccupancy[]>([{ adults: 2 }]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/clients")
      .then((r) => r.json())
      .then((data) => setClients(data.clients || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (destinationQuery.trim().length < 2 || selected) {
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(
        `/api/admin/le/search?query=${encodeURIComponent(destinationQuery)}`
      );
      const data = await res.json();
      if (res.ok) setSuggestions(data.results || []);
    }, 250);
    return () => clearTimeout(handle);
  }, [destinationQuery, selected]);

  const canSubmit = useMemo(
    () => Boolean(selected && startDate && endDate && rooms.length),
    [selected, startDate, endDate, rooms]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError(null);

    const isHotel = selected.type === "hotel";
    const res = await fetch("/api/admin/dossiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId || null,
        destination_text: selected.text,
        location_id: isHotel ? null : selected.id,
        location_type: selected.type,
        hotel_id: isHotel ? selected.id : null,
        hotel_name: isHotel ? selected.text : null,
        start_date: startDate,
        end_date: endDate,
        currency,
        rooms,
        notes: notes || null,
      }),
    });

    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Création impossible");
      return;
    }
    router.push(`/admin/dossiers/${data.dossier.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight">Nouveau dossier</h1>
        <p className="mt-1 text-sm text-muted">
          Destination, dates et occupation — puis recherche Little Emperors.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-border bg-surface/50 p-5">
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          >
            <option value="">— Sans client —</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <div className="relative space-y-1.5 text-sm">
          <span className="text-muted">Destination / hôtel</span>
          <input
            value={selected ? selected.text : destinationQuery}
            onChange={(e) => {
              setSelected(null);
              setDestinationQuery(e.target.value);
            }}
            placeholder="Paris, London, Four Seasons…"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            required
          />
          {!selected && destinationQuery.trim().length >= 2 && suggestions.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface-2 shadow-xl">
              {suggestions.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-white/5"
                    onClick={() => {
                      setSelected(item);
                      setDestinationQuery(item.text);
                      setSuggestions([]);
                    }}
                  >
                    <span className="font-medium">{item.text}</span>
                    <span className="text-xs text-muted">
                      {item.type}
                      {item.location ? ` · ${item.location}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Arrivée</span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Départ</span>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted">Devise</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2"
            >
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="HKD">HKD</option>
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Chambres</span>
            <button
              type="button"
              className="text-sm text-accent-2"
              onClick={() => setRooms((prev) => [...prev, { adults: 2 }])}
            >
              + Chambre
            </button>
          </div>
          {rooms.map((room, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2"
            >
              <span className="text-xs text-muted">Ch. {index + 1}</span>
              <label className="flex items-center gap-2 text-sm">
                Adultes
                <input
                  type="number"
                  min={1}
                  value={room.adults}
                  onChange={(e) => {
                    const adults = Number(e.target.value);
                    setRooms((prev) =>
                      prev.map((r, i) => (i === index ? { ...r, adults } : r))
                    );
                  }}
                  className="w-16 rounded border border-border bg-surface-2 px-2 py-1"
                />
              </label>
              {rooms.length > 1 ? (
                <button
                  type="button"
                  className="ml-auto text-xs text-accent-3"
                  onClick={() =>
                    setRooms((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  Retirer
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2"
          />
        </label>

        {error ? <p className="text-sm text-accent-3">{error}</p> : null}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Création…" : "Créer le dossier"}
        </button>
      </form>
    </div>
  );
}
