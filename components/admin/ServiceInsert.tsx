"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrainRequestButton } from "@/components/admin/TrainRequestButton";
import { enabledServiceKind, SERVICE_STEP_OPTIONS, serviceRequestPrefill, type ServiceKind, type ServiceNeighbor, type ServiceSide } from "@/lib/crm/service-request";
import type { CrmBookingItem } from "@/lib/crm/types";

function neighborOf(item: CrmBookingItem): ServiceNeighbor {
  const details = item.details || {};
  const text = (key: string) => (typeof details[key] === "string" ? details[key] : "");
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    city: text("city"),
    from: text("city_from"),
    to: text("city_to"),
    start: item.start_at,
    end: item.end_at,
    sortOrder: item.sort_order,
  };
}

/** Carte d’ajout, juste avant ou juste après un hébergement. */
export function ServiceInsert({
  bookingId,
  travelers,
  homeCity = "",
  hotel,
  side,
  preview = false,
  startOpen = false,
  startPicker = false,
}: {
  bookingId: string;
  travelers: { id: string; name: string }[];
  homeCity?: string;
  hotel: CrmBookingItem;
  side: ServiceSide;
  preview?: boolean;
  startOpen?: boolean;
  startPicker?: boolean;
}) {
  const router = useRouter();
  const [picker, setPicker] = useState(startPicker);
  const [kind, setKind] = useState<ServiceKind | null>(startOpen ? "train" : null);
  const filled = kind ? serviceRequestPrefill({ kind, side, neighbor: neighborOf(hotel), homeCity }) : null;
  const where = side === "avant" ? "avant cet hôtel" : "après cet hôtel";

  function choose(next: string) {
    const enabled = enabledServiceKind(next);
    if (!enabled || enabled !== "train") return;
    setKind(enabled);
    setPicker(false);
  }

  if (kind === "train" && filled) {
    return (
      <div className="my-2 rounded-2xl border border-dashed border-[var(--admin-navy)] bg-white p-3">
        <TrainRequestButton
          bookingId={bookingId}
          travelers={travelers}
          defaults={filled}
          embedded
          startOpen
          preview={preview}
          anchorItemId={hotel.id}
          anchorSide={side}
          onDone={() => {
            setKind(null);
            if (!preview) router.refresh();
          }}
        />
        <button type="button" className="mt-2 text-xs font-semibold text-muted" onClick={() => setKind(null)}>
          Fermer
        </button>
      </div>
    );
  }

  if (picker) {
    return (
      <div className="my-2 rounded-2xl border border-dashed border-[var(--admin-navy)] bg-[#faf9f6] px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Type d’étape</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SERVICE_STEP_OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              disabled={!option.enabled}
              aria-disabled={!option.enabled}
              onClick={() => choose(option.kind)}
              className={`admin-tap inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                option.enabled
                  ? "bg-[var(--admin-navy)] text-white"
                  : "cursor-not-allowed bg-white text-muted ring-1 ring-[var(--border)]"
              }`}
            >
              {option.label}
              {option.soon ? (
                <span className="rounded-full bg-[#f8f3eb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
                  {option.soon}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <button type="button" className="mt-3 text-xs font-semibold text-muted" onClick={() => setPicker(false)}>
          Fermer
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Ajouter une étape ${where}`}
      onClick={() => setPicker(true)}
      className="admin-tap my-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--admin-navy)] bg-[#faf9f6] px-4 py-5 text-sm font-semibold text-[var(--admin-navy)]"
    >
      <span aria-hidden className="text-xl leading-none">+</span>
      Ajouter une étape
    </button>
  );
}
