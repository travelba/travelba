"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HOTEL_BUTTON_AUTHORIZED, HOTEL_BUTTON_EVERYONE, type HotelButtonVisibility } from "@/lib/crm/hotel-access";

const OPTIONS: { value: HotelButtonVisibility; title: string; text: string }[] = [
  {
    value: HOTEL_BUTTON_AUTHORIZED,
    title: "Clients autorisés seulement",
    text: "Le bouton n’apparaît que si l’accès Hôtels est activé sur la fiche.",
  },
  {
    value: HOTEL_BUTTON_EVERYONE,
    title: "Tous les clients",
    text: "Le bouton est visible pour tous. Sans accès, l’écran membres s’affiche.",
  },
];

export function HotelButtonSetting({ value }: { value: HotelButtonVisibility }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function choose(next: HotelButtonVisibility) {
    if (next === current) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/outils/hotels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "Le réglage n’a pas été enregistré.");
        return;
      }
      setCurrent(next);
      setNote("Enregistré.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-6 space-y-3" data-hotel-button-setting="1">
      <legend className="text-sm font-semibold text-[var(--admin-navy)]">Visibilité du bouton Hôtels</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="admin-af-card flex cursor-pointer gap-3 rounded-2xl px-4 py-3">
          <input
            type="radio"
            name="hotel_button_visibility"
            className="mt-1"
            checked={current === option.value}
            disabled={busy}
            onChange={() => void choose(option.value)}
          />
          <span>
            <span className="block font-semibold text-[var(--admin-navy)]">{option.title}</span>
            <span className="mt-1 block text-sm text-muted">{option.text}</span>
          </span>
        </label>
      ))}
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
    </fieldset>
  );
}
