"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAction } from "@/lib/crm/admin-action";
import { showTakeCharge } from "@/lib/crm/owner-filter";
import { staffGivenName } from "@/lib/crm/staff-name";

/**
 * Pastille En charge en tête de dossier, et « Me mettre en charge » en un geste.
 * Le clic sur le nom ouvre l’historique. La prise en charge reprend la route déjà en place.
 */
export function ChargeControl({
  bookingId,
  owner,
  createdBy,
  mine,
  canTake,
  meName,
  compact = false,
  onHistory,
}: {
  bookingId: string;
  owner: string | null;
  createdBy: string | null;
  mine: boolean;
  canTake: boolean;
  meName: string;
  compact?: boolean;
  onHistory?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showingMine = mine || taken;
  const given = showingMine ? staffGivenName(meName) || staffGivenName(owner) : staffGivenName(owner);
  const label = showingMine
    ? `En charge : ${given || "vous"} (vous)`
    : owner
      ? `En charge : ${given || owner}`
      : "À prendre";
  const take = showTakeCharge({ canTake, mine: showingMine });

  async function takeCharge() {
    setBusy(true);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/responsable`, {
      method: "PATCH",
      body: { action: "prendre" },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Enregistrement impossible.");
      return;
    }
    setTaken(true);
    router.refresh();
  }

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onHistory}
        title={createdBy ? `Créé par ${createdBy}` : "Créé par : inconnu"}
        className={`inline-flex items-center rounded-full font-semibold ${
          showingMine || owner
            ? "bg-[#0B192C] text-[#C5A880]"
            : "border border-dashed border-[#9e7e51] bg-white text-[#9e7e51]"
        } ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1 text-sm"}`}
      >
        {label}
      </button>
      {take ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void takeCharge()}
          className={`admin-af-btn admin-tap rounded-full disabled:opacity-50 ${
            compact ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
          }`}
        >
          {busy ? "Enregistrement…" : "Me mettre en charge"}
        </button>
      ) : null}
      {error ? <span className="basis-full text-xs font-semibold text-[var(--admin-red)]">{error}</span> : null}
    </span>
  );
}
