"use client";

import { StayCard } from "@/components/crm/StayCard";
import { stayCardFace } from "@/lib/crm/hotel-arrival";
import type { PrecheckTraveler } from "@/lib/crm/hotel-precheck";

function pieceWord(label: string) {
  return label === "Carte d'identité" ? "Identité" : label;
}

export function PrecheckPack({
  bookingId,
  itemId,
  party,
  selectedIds,
  last4,
  holder = "",
  hotel = "",
  disabled,
  generating,
  onToggle,
  onGenerate,
}: {
  bookingId: string;
  itemId: string;
  party: PrecheckTraveler[];
  selectedIds: string[];
  last4: string | null;
  holder?: string;
  hotel?: string;
  disabled: boolean;
  generating: boolean;
  onToggle: (id: string) => void;
  onGenerate: () => void;
}) {
  const chosen = new Set(selectedIds);
  return (
    <div className="space-y-1 text-xs text-[#0B192C]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {party.length ? (
          party.map((traveler) =>
            traveler.pieces.length ? (
              traveler.pieces.map((piece) => (
                <label key={piece.id} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="accent-[#0B192C]"
                    checked={chosen.has(piece.id)}
                    disabled={disabled}
                    aria-label={`Joindre ${piece.label} de ${traveler.name}`}
                    onChange={() => onToggle(piece.id)}
                  />
                  <span className="font-medium">{traveler.name}</span>
                  <span className="text-[#9e7e51]">{pieceWord(piece.label)}</span>
                </label>
              ))
            ) : (
              <span key={traveler.id} className="text-[#9e7e51]">
                {traveler.name} · aucune pièce
              </span>
            )
          )
        ) : (
          <span className="text-[#9e7e51]">Aucun voyageur</span>
        )}
      </div>
      {last4 ? null : (
        <button type="button" className="text-[#9e7e51] underline disabled:opacity-50" disabled={disabled} onClick={onGenerate}>
          {generating ? "…" : "Générer la carte"}
        </button>
      )}
      <p className="text-[11px] text-[#9e7e51]">
        La carte de l’hôtel part par lien sécurisé, jamais en pièce jointe : 3 ouvertures, jusqu’à 3 jours après le départ.
      </p>
      {last4 ? (
        <StayCard
          personal
          revealUrl={`/api/admin/bookings/${bookingId}/hotel-arrival`}
          face={stayCardFace({ itemId, hotel, holder, last4, closed: false })}
        />
      ) : null}
    </div>
  );
}
