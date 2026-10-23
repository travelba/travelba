"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HOTEL_MEMBERSHIP_LABEL } from "@/lib/crm/hotel-access";

export function HotelAccessCard({
  customerId,
  enabled,
  demo,
  live,
  pendingAt,
  admin,
  preview = false,
}: {
  customerId: string;
  enabled: boolean;
  demo: boolean;
  live: boolean;
  pendingAt: string | null;
  admin: boolean;
  preview?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    if (preview) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/admin/clients/${customerId}/hotels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(json?.error || (response.ok ? "Enregistré." : "Action impossible."));
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-af-card rounded-3xl px-5 py-4" data-hotel-access-card="1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">Accès Hôtels</p>
          <p className="mt-1 text-sm text-[var(--admin-navy)]">
            {enabled ? "Activé" : "Désactivé"}
            {demo ? " · compte de démonstration, mode test" : ""}
            {live ? " · mode réel" : ""}
          </p>
        </div>
        {admin ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Accès Hôtels"
            disabled={busy}
            onClick={() => void post({ enabled: !enabled, live: enabled ? false : live })}
            className={`relative h-7 w-12 shrink-0 rounded-full ${enabled ? "bg-[var(--admin-navy)]" : "bg-[#e5e3dc]"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white ${enabled ? "left-5" : "left-0.5"}`} />
          </button>
        ) : (
          <p className="text-xs text-muted">Réservé aux administrateurs.</p>
        )}
      </div>
      {admin && enabled && !demo ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--admin-navy)]">
          <input
            type="checkbox"
            checked={live}
            disabled={busy}
            onChange={(event) => void post({ enabled: true, live: event.target.checked })}
          />
          Mode réel
        </label>
      ) : null}
      {pendingAt ? (
        <div className="mt-4 rounded-2xl bg-[#f8f3eb] px-3 py-3" data-hotel-access-task="1">
          <p className="text-sm font-semibold text-[var(--admin-navy)]">Demande d’accès {HOTEL_MEMBERSHIP_LABEL}</p>
          <p className="mt-1 text-xs text-muted">
            {new Date(pendingAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          {admin ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ request: "accept" })}
                className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Accepter
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void post({ request: "refuse" })}
                className="rounded-full border border-[#e5e3dc] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
              >
                Refuser
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {note ? <p className="mt-3 text-sm text-[var(--admin-navy)]">{note}</p> : null}
    </section>
  );
}
