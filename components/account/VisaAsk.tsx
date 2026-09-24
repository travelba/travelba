"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VISA_OFFICIAL, type VisaCorridor } from "@/lib/crm/visa-fees";

export function VisaAsk({ reference, country }: { reference: string; country: VisaCorridor }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState({
    usAddress: "",
    employment: "",
    countriesVisited: "",
    priorRefusal: "",
  });
  const official = VISA_OFFICIAL[country];

  async function ask() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/client/bookings/${reference}/visa`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country, answers }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(json?.error || "La demande n’a pas pu partir.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">
        {official.countryName} · {official.amount} {official.currency}
      </p>
      {country === "US" ? (
        <div className="grid gap-2">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Adresse du séjour aux États-Unis" value={answers.usAddress} onChange={(event) => setAnswers({ ...answers, usAddress: event.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Emploi" value={answers.employment} onChange={(event) => setAnswers({ ...answers, employment: event.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Pays visités" value={answers.countriesVisited} onChange={(event) => setAnswers({ ...answers, countriesVisited: event.target.value })} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Refus antérieur" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
        </div>
      ) : null}
      {country === "GB" ? (
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Refus antérieur" value={answers.priorRefusal} onChange={(event) => setAnswers({ ...answers, priorRefusal: event.target.value })} />
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={ask}
        className="inline-flex h-10 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "En cours…" : "Faire la demande"}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
