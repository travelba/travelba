"use client";

import { useEffect, useRef } from "react";
import { hotelThread, hotelStayContext, type HotelMailPiece, type HotelThreadTurn } from "@/lib/crm/hotel-desk";
import { followUpCountLabel } from "@/lib/crm/mail-followup";
import { formatDateTimeFr } from "@/lib/crm/money";
import type { CrmBookingItem, CrmHotelMessage, CrmHotelRequest, CrmHotelThreadMessage } from "@/lib/crm/types";

/** Fil des échanges avec l’hôtel. L’envoi se fait depuis un courrier, dont Autre demande. */
export function HotelThread({
  item,
  requests,
  messages,
  thread = [],
  attached,
  turns: turnsProp,
  onRelance,
}: {
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  messages: CrmHotelMessage[];
  thread?: CrmHotelThreadMessage[];
  attached: HotelMailPiece[];
  turns?: HotelThreadTurn[];
  onRelance?: (turn: HotelThreadTurn) => void;
}) {
  const logRef = useRef<HTMLOListElement>(null);
  const context = hotelStayContext(item);
  const turns = turnsProp ?? hotelThread({ item, requests, messages, attached, thread });

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns.length]);

  return (
    <section className="rounded-2xl border border-[#e5e0d4] bg-[#faf9f6]" aria-label={`Échanges avec ${context.hotel}`}>
      <header className="border-b border-[#e5e0d4] px-3 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f552c]">Avec l’hôtel</p>
        <p className="mt-1 text-sm font-semibold text-[#0B192C]">{context.hotel}</p>
        {context.subtitle ? <p className="text-xs font-medium text-[#3d4654]">{context.subtitle}</p> : null}
      </header>
      {turns.length ? (
        <ol ref={logRef} className="max-h-96 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
          {turns.map((turn) => {
            const outbound = turn.direction === "out";
            return (
              <li
                key={turn.id}
                className={
                  outbound
                    ? "ml-6 rounded-2xl bg-[#0B192C] px-3 py-3 text-[#faf9f6]"
                    : "mr-6 rounded-2xl border border-[#e5e0d4] border-l-[#C5A880] border-l-4 bg-white px-3 py-3 text-[#0B192C] shadow-[0_1px_2px_rgba(11,25,44,0.06)]"
                }
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                  <span className={outbound ? "text-[#C5A880]" : "text-[#0B192C]"}>{turn.speaker}</span>
                  <span className={outbound ? "text-[#C5A880]" : "text-[#6f552c]"}> · {turn.label}</span>
                </p>
                {turn.subject ? (
                  <p className={`mt-1 text-xs font-semibold ${outbound ? "text-[#faf9f6]" : "text-[#0B192C]"}`}>{turn.subject}</p>
                ) : null}
                <p className={`mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed ${outbound ? "text-[#faf9f6]" : "text-[#0B192C]"}`}>
                  {turn.body}
                </p>
                {turn.link ? (
                  <a
                    href={turn.link}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-2 block break-all text-sm font-semibold underline ${outbound ? "text-[#C5A880]" : "text-[#0B192C] decoration-[#C5A880]"}`}
                  >
                    {turn.link}
                  </a>
                ) : null}
                {turn.at ? (
                  <p className={outbound ? "mt-2 text-xs text-[#C5A880]" : "mt-2 text-xs font-medium text-[#3d4654]"}>
                    {formatDateTimeFr(turn.at)}
                  </p>
                ) : null}
                {turn.relance?.unanswered ? (
                  <p className="mt-2">
                    <span className="inline-block rounded-full bg-[#C5A880] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0B192C]">
                      Sans réponse
                    </span>
                  </p>
                ) : null}
                {turn.relance && turn.relance.followUps > 0 ? (
                  <p className={outbound ? "mt-1 text-xs text-[#C5A880]" : "mt-1 text-xs font-medium text-[#3d4654]"}>
                    {followUpCountLabel(turn.relance.followUps)}
                  </p>
                ) : null}
                {outbound && turn.relance && onRelance ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#C5A880] px-3 text-sm font-semibold text-[#0B192C]"
                    onClick={() => onRelance(turn)}
                  >
                    Relancer
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-3 py-4 text-sm text-[#3d4654]">Aucun échange avec cet hôtel pour l’instant.</p>
      )}
    </section>
  );
}
