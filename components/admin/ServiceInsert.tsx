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

function labelOf(item: CrmBookingItem) {
  return item.title || "cette carte";
}

/** Point d’insertion entre deux cartes. Même geste qu’un ajout de transfert : le menu choisit le côté. */
export function ServiceInsert({
  bookingId,
  travelers,
  homeCity = "",
  previous = null,
  next = null,
  preview = false,
  startChoice = null,
}: {
  bookingId: string;
  travelers: { id: string; name: string }[];
  homeCity?: string;
  previous?: CrmBookingItem | null;
  next?: CrmBookingItem | null;
  preview?: boolean;
  startChoice?: { side: ServiceSide; item: CrmBookingItem } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<{ side: ServiceSide; item: CrmBookingItem } | null>(startChoice);
  const options = [
    previous ? { side: "apres" as const, item: previous, label: `Demande de train · après ${labelOf(previous)}` } : null,
    next ? { side: "avant" as const, item: next, label: `Demande de train · avant ${labelOf(next)}` } : null,
  ].filter((option): option is { side: ServiceSide; item: CrmBookingItem; label: string } => Boolean(option));
  if (!options.length) return null;
  const filled = choice
    ? serviceRequestPrefill({ kind: "train", side: choice.side, neighbor: neighborOf(choice.item), homeCity })
    : null;

  return (
    <div className="relative z-10 py-1">
      {choice && filled ? (
        <div className="rounded-2xl border border-dashed border-[var(--admin-gold)] bg-white p-3">
          <TrainRequestButton
            bookingId={bookingId}
            travelers={travelers}
            defaults={filled}
            embedded
            startOpen
            preview={preview}
            anchorItemId={choice.item.id}
            anchorSide={choice.side}
            onDone={() => {
              setChoice(null);
              setOpen(false);
              if (!preview) router.refresh();
            }}
          />
          <button type="button" className="mt-2 text-xs font-semibold text-muted" onClick={() => setChoice(null)}>
            Fermer
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label="Ajouter une demande entre ces cartes"
            onClick={() => setOpen((value) => !value)}
            className="admin-tap inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[var(--admin-navy)] text-sm font-semibold text-[var(--admin-navy)]"
          >
            +
          </button>
          {open
            ? options.map((option) => (
                <button
                  key={`${option.side}-${option.item.id}`}
                  type="button"
                  className="admin-tap rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
                  onClick={() => {
                    setChoice({ side: option.side, item: option.item });
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            : null}
        </div>
      )}
    </div>
  );
}
