"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isSpouseRelationship } from "@/lib/crm/travel-whatsapp-audience";
import { toE164 } from "@/lib/crm/phone";
import type { CrmBookingTraveler, CrmCompanion } from "@/lib/crm/types";

function travelerName(traveler: CrmBookingTraveler) {
  return [traveler.first_name, traveler.last_name].filter(Boolean).join(" ").trim() || "Conjoint";
}

/** Case par conjoint voyageur. Cochée par défaut. Aucun message au clic. */
export function SpouseTravelWhatsapp({
  bookingId,
  travelers,
  companions,
}: {
  bookingId: string;
  travelers: CrmBookingTraveler[];
  companions: CrmCompanion[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = travelers.flatMap((traveler) => {
    if (traveler.is_account_holder || !traveler.companion_id) return [];
    const companion = companions.find((row) => row.id === traveler.companion_id);
    if (!companion || !isSpouseRelationship(companion.relationship)) return [];
    return [{ traveler, companion, phone: toE164(companion.phone || "", "FR") }];
  });
  if (!rows.length) return null;

  async function toggle(travelerId: string, enabled: boolean) {
    setBusyId(travelerId);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/travelers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ travelerId, whatsapp_travel_updates: enabled }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "La case n’a pas pu être enregistrée.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-2xl border border-[var(--admin-line)] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">Infos voyage WhatsApp</p>
      {rows.map(({ traveler, phone }) => {
        const checked = traveler.whatsapp_travel_updates !== false;
        return (
          <label key={traveler.id} className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={checked}
              disabled={!phone || busyId === traveler.id}
              onChange={(event) => void toggle(traveler.id, event.target.checked)}
            />
            <span>
              {travelerName(traveler)} reçoit les infos voyage WhatsApp
              {phone ? null : <span className="mt-0.5 block text-xs text-muted">Ajoutez un téléphone au format international.</span>}
            </span>
          </label>
        );
      })}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
