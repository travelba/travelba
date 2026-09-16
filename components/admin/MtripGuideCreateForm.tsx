"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MtripGuidePassenger } from "@/lib/mtrip/guide-types";
import { PassportPassengerPanel } from "@/components/admin/PassportPassengerPanel";
import { passengerCompleteness } from "@/lib/mtrip/passenger-schema";

export function MtripGuideCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [passengers, setPassengers] = useState<MtripGuidePassenger[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lead = passengers[0];

  const canSubmit = useMemo(() => {
    if (title.trim().length < 2) return false;
    if (!passengers.length) return false;
    if (!passengers.every((p) => p.first_name.trim() && p.last_name.trim())) {
      return false;
    }
    if (!lead?.email?.trim() || !lead?.phone?.trim()) return false;
    return true;
  }, [title, passengers, lead]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/mtrip/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        passengers: passengers.map((p, index) => ({
          ...p,
          email: p.email || null,
          phone: p.phone || null,
          role: index === 0 ? "lead_traveler" : "traveler",
          import_status:
            p.import_status ||
            (passengerCompleteness(p).complete ? "complete" : "review"),
        })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Création impossible");
      return;
    }
    router.push(`/admin/mtrip/${data.guide.id}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="admin-af-card space-y-6 rounded-2xl p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">1. Passagers (passeports)</h2>
        <p className="text-sm text-muted">
          Importez tous les passeports d&apos;un coup ou un par un — chaque
          import enrichit la liste. Toutes les données billet / visa sont
          extraites automatiquement quand la MRZ est lisible.
        </p>
      </div>

      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Titre du voyage</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Famille Benamara — Panama août 2026"
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">Début</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted">Fin</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5"
          />
        </label>
      </div>

      <PassportPassengerPanel
        passengers={passengers}
        onPassengersChange={setPassengers}
        requireLeadContact
      />

      {error && <p className="text-sm text-[var(--admin-red)]">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="admin-af-btn rounded-full px-5 py-2.5 text-sm disabled:opacity-50"
      >
        {loading ? "Création…" : "Continuer — upload des confirmations"}
      </button>
    </form>
  );
}
