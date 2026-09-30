"use client";

import { AgencyCardPeek } from "@/components/admin/AgencyCardPeek";
import { StayCard } from "@/components/crm/StayCard";
import { stayCardFace } from "@/lib/crm/hotel-arrival";
import type { PrecheckTraveler } from "@/lib/crm/hotel-precheck";
import type { CardViewLine } from "@/lib/crm/types";

function pieceWord(label: string) {
  return label === "Carte d'identité" ? "Identité" : label;
}

export function PrecheckPack({
  bookingId,
  itemId,
  party,
  selectedIds,
  cardChoice,
  last4,
  holder = "",
  hotel = "",
  clientFileName,
  cardViews = [],
  disabled,
  generating,
  onToggle,
  onCardChoice,
  onGenerate,
  onClientFile,
  onCodeReady,
}: {
  bookingId: string;
  itemId: string;
  party: PrecheckTraveler[];
  selectedIds: string[];
  cardChoice: "pliant" | "client";
  last4: string | null;
  holder?: string;
  hotel?: string;
  clientFileName: string | null;
  hasCardCode?: boolean;
  cardViews?: CardViewLine[];
  disabled: boolean;
  generating: boolean;
  onToggle: (id: string) => void;
  onCardChoice: (choice: "pliant" | "client") => void;
  onGenerate: () => void;
  onClientFile: (file: File | null) => void;
  onCodeReady?: () => void;
}) {
  const chosen = new Set(selectedIds);
  const cardReady = cardChoice === "pliant" ? Boolean(last4) : Boolean(clientFileName);
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <button
          type="button"
          className={cardChoice === "pliant" ? "font-semibold" : "text-[#9e7e51]"}
          aria-pressed={cardChoice === "pliant"}
          disabled={disabled}
          onClick={() => onCardChoice("pliant")}
        >
          Pliant
        </button>
        <span className="text-[#e5e3dc]">/</span>
        <button
          type="button"
          className={cardChoice === "client" ? "font-semibold" : "text-[#9e7e51]"}
          aria-pressed={cardChoice === "client"}
          disabled={disabled}
          onClick={() => onCardChoice("client")}
        >
          Client
        </button>
        {cardChoice === "pliant" ? (
          last4 ? null : (
            <button type="button" className="text-[#9e7e51] underline disabled:opacity-50" disabled={disabled} onClick={onGenerate}>
              {generating ? "…" : "Générer"}
            </button>
          )
        ) : (
          <>
            <label className="cursor-pointer text-[#9e7e51] underline">
              {clientFileName || "Déposer"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  event.target.value = "";
                  onClientFile(file);
                }}
              />
            </label>
            {clientFileName ? (
              <button type="button" className="text-[#9e7e51]" disabled={disabled} aria-label="Retirer la carte" onClick={() => onClientFile(null)}>
                ×
              </button>
            ) : null}
          </>
        )}
        {cardReady && cardChoice === "client" ? (
          <AgencyCardPeek
            bookingId={bookingId}
            itemId={itemId}
            source="client"
            views={cardViews}
            onReady={onCodeReady}
          />
        ) : null}
      </div>
      {cardChoice === "pliant" && last4 ? (
        <StayCard
          revealUrl={`/api/admin/bookings/${bookingId}/hotel-arrival`}
          face={stayCardFace({ itemId, hotel, holder, last4, closed: false })}
        />
      ) : null}
    </div>
  );
}
