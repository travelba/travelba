"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrainRequestButton } from "@/components/admin/TrainRequestButton";
import { serviceRequestPrefill, type ServiceNeighbor, type ServiceSide } from "@/lib/crm/service-request";
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

/** Carte d’ajout, juste avant ou juste après un hôtel. */
export function ServiceInsert({
  bookingId,
  travelers,
  homeCity = "",
  hotel,
  side,
  preview = false,
  startOpen = false,
}: {
  bookingId: string;
  travelers: { id: string; name: string }[];
  homeCity?: string;
  hotel: CrmBookingItem;
  side: ServiceSide;
  preview?: boolean;
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const filled = serviceRequestPrefill({ kind: "train", side, neighbor: neighborOf(hotel), homeCity });
  const where = side === "avant" ? "avant cet hôtel" : "après cet hôtel";

  if (open) {
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
            setOpen(false);
            if (!preview) router.refresh();
          }}
        />
        <button type="button" className="mt-2 text-xs font-semibold text-muted" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Ajouter une demande de train ${where}`}
      onClick={() => setOpen(true)}
      className="admin-tap my-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--admin-navy)] bg-[#faf9f6] px-4 py-5 text-sm font-semibold text-[var(--admin-navy)]"
    >
      <span aria-hidden className="text-xl leading-none">+</span>
      Ajouter une demande de train
    </button>
  );
}
