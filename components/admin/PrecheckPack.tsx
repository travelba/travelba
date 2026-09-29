"use client";

import { AgencyCardPeek } from "@/components/admin/AgencyCardPeek";
import { maskedCardNumber } from "@/lib/crm/hotel-arrival";
import type { PrecheckTraveler } from "@/lib/crm/hotel-precheck";
import type { CardViewLine } from "@/lib/crm/types";

export function PrecheckPack({
  bookingId,
  itemId,
  party,
  selectedIds,
  cardChoice,
  last4,
  clientFileName,
  hasCardCode,
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
  clientFileName: string | null;
  hasCardCode: boolean;
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
  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C5A880]">Pièces des voyageurs</p>
        <ul className="mt-1 divide-y divide-[#e5e3dc] overflow-hidden rounded-lg border border-[#e5e3dc]">
          {party.length ? (
            party.map((traveler) =>
              traveler.pieces.length ? (
                traveler.pieces.map((piece) => (
                  <li key={piece.id} className="flex items-center gap-2 px-2 py-1">
                    <input
                      type="checkbox"
                      className="accent-[#0B192C]"
                      checked={chosen.has(piece.id)}
                      disabled={disabled}
                      aria-label={`Joindre ${piece.label} de ${traveler.name}`}
                      onChange={() => onToggle(piece.id)}
                    />
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-[#0B192C]">{traveler.name}</span>
                      <span className="text-[#9e7e51]"> · {piece.label}</span>
                    </span>
                  </li>
                ))
              ) : (
                <li key={traveler.id} className="flex items-center gap-2 px-2 py-1 text-[#9e7e51]">
                  <span className="font-semibold text-[#0B192C]">{traveler.name}</span>
                  aucune pièce
                </li>
              )
            )
          ) : (
            <li className="px-2 py-1 text-[#9e7e51]">Aucun voyageur sur le dossier.</li>
          )}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C5A880]">Carte</span>
        <label className="inline-flex items-center gap-1 font-semibold text-[#0B192C]">
          <input type="radio" name={`precheck-card-${itemId}`} checked={cardChoice === "pliant"} disabled={disabled} onChange={() => onCardChoice("pliant")} />
          Pliant
        </label>
        <label className="inline-flex items-center gap-1 font-semibold text-[#0B192C]">
          <input type="radio" name={`precheck-card-${itemId}`} checked={cardChoice === "client"} disabled={disabled} onChange={() => onCardChoice("client")} />
          Carte du client
        </label>
        {cardChoice === "pliant" ? (
          last4 ? (
            <span className="text-[#0B192C]">{maskedCardNumber(last4)} · jointe à l'envoi</span>
          ) : (
            <button type="button" className="rounded-full bg-[#0B192C] px-2.5 py-1 font-semibold text-white disabled:opacity-50" disabled={disabled} onClick={onGenerate}>
              {generating ? "Génération…" : "Générer la carte"}
            </button>
          )
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[#C5A880] px-2.5 py-1 font-semibold text-[#0B192C]">
            {clientFileName || "Déposer la carte"}
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
        )}
        {cardChoice === "client" && clientFileName ? (
          <button type="button" className="text-[#9e7e51] underline" disabled={disabled} onClick={() => onClientFile(null)}>
            Retirer
          </button>
        ) : null}
      </div>
      <p className="text-[#9e7e51]">
        {cardChoice === "pliant"
          ? last4
            ? "Enregistrée pour l'agence. Les chiffres s'ouvrent avec le code maître."
            : "La carte reste côté agence. Les chiffres s'ouvrent avec le code maître."
          : clientFileName
            ? "Enregistrée pour l'agence. La photo s'ouvre avec le code maître."
            : "La photo reste côté agence. Elle s'ouvre avec le code maître."}
      </p>
      {cardChoice === "pliant" && last4 ? (
        <AgencyCardPeek bookingId={bookingId} itemId={itemId} source="pliant" hasCode={hasCardCode} views={cardViews} onReady={onCodeReady} />
      ) : null}
      {cardChoice === "client" && clientFileName ? (
        <AgencyCardPeek bookingId={bookingId} itemId={itemId} source="client" hasCode={hasCardCode} views={cardViews} onReady={onCodeReady} />
      ) : null}
    </div>
  );
}
