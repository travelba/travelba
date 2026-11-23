"use client";

import { useEffect, useState } from "react";

type Prefs = {
  available: boolean;
  messages?: boolean;
  push_travel: boolean;
  push_documents: boolean;
  push_payment: boolean;
  push_messages: boolean;
};

const ROWS = [
  ["push_travel", "Vols et départs"],
  ["push_documents", "Documents"],
  ["push_payment", "Règlements"],
  ["push_messages", "Messages de l’agence"],
] as const;

/** Réglages de l’application TBA. Caché tant que la migration n’est pas en place. */
export function PushPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/client/notifications", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as Prefs;
      })
      .then((data) => {
        if (!cancelled && data?.available) setPrefs(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(field: (typeof ROWS)[number][0], value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [field]: value });
    setError(null);
    const response = await fetch("/api/client/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      setPrefs(previous);
      setError("Le réglage n’a pas été enregistré. Réessayez.");
    }
  }

  if (!prefs) return null;

  return (
    <section className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--admin-navy)]">Notifications de l’application</h2>
      <p className="mt-1 text-xs text-muted">Vols, documents, règlements et messages, sur l’application TBA.</p>
      <ul className="mt-2">
        {ROWS.filter(([field]) => field !== "push_messages" || prefs.messages !== false).map(([field, label]) => (
          <li key={field} className="flex items-center justify-between gap-3 border-t border-[#e3e2e0]/70 py-2.5 first:border-t-0">
            <span className="text-sm text-[var(--admin-navy)]">{label}</span>
            <input
              type="checkbox"
              checked={prefs[field]}
              aria-label={label}
              onChange={(event) => {
                void toggle(field, event.target.checked);
              }}
              className="h-4 w-4 accent-[var(--admin-navy)]"
            />
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </section>
  );
}
