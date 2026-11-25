"use client";

import { Icon } from "@/components/crm/icons";
import { hiddenCardsLabel } from "@/lib/crm/carnet";

/** Pastille lisible, en haut à droite de la carte. L’opacité de la carte ne la couvre pas. */
export function HiddenCardBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[var(--admin-navy)] ring-1 ring-[#0B192C]/25">
      <Icon name="eye_off" className="h-3.5 w-3.5" />
      Caché au client
    </span>
  );
}

/** Compteur d’en-tête. Absent quand toutes les cartes sont montrées. */
export function HiddenCardsCounter({ count, onJump }: { count: number; onJump: () => void }) {
  const label = hiddenCardsLabel(count);
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onJump}
      className="admin-tap inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#0B192C]/45 bg-[#F4F1EA] px-3 py-1 text-sm font-semibold text-[var(--admin-navy)]"
    >
      <Icon name="eye_off" className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
