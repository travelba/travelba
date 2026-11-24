"use client";

import { useEffect, useRef, useState } from "react";
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
  onReply,
  destinations = [],
  onMove,
}: {
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  messages: CrmHotelMessage[];
  thread?: CrmHotelThreadMessage[];
  attached: HotelMailPiece[];
  turns?: HotelThreadTurn[];
  onRelance?: (turn: HotelThreadTurn) => void;
  onReply?: (turn: HotelThreadTurn) => void;
  destinations?: { id: string; name: string }[];
  onMove?: (input: { messageId: string; carteCible: string; fil: boolean; confirmer: boolean }) => Promise<{
    error?: string;
    ecrit?: boolean;
    vers?: { hotel: string };
    messages?: { extrait: string }[];
  }>;
}) {
  const logRef = useRef<HTMLOListElement>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(destinations[0]?.id || "");
  const [wholeThread, setWholeThread] = useState(false);
  const [preview, setPreview] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
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
                {!outbound && turn.reply && onReply ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#0B192C] px-3 text-sm font-semibold text-[#faf9f6]"
                    onClick={() => onReply(turn)}
                  >
                    Répondre
                  </button>
                ) : null}
                {!outbound && turn.reply?.threadId && destinations.length > 0 && onMove ? (
                  movingId === turn.reply.threadId ? (
                    <form
                      className="mt-2 space-y-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!turn.reply?.threadId || !targetId || moving) return;
                        setMoving(true);
                        setMoveError(null);
                        void onMove({ messageId: turn.reply.threadId, carteCible: targetId, fil: wholeThread, confirmer: Boolean(preview) }).then(
                          (result) => {
                            setMoving(false);
                            if (result.error) {
                              setMoveError(result.error);
                              return;
                            }
                            if (result.ecrit) {
                              setMovingId(null);
                              setPreview("");
                              return;
                            }
                            const count = result.messages?.length || 1;
                            setPreview(
                              `${count === 1 ? "1 message" : `${count} messages`} vers ${result.vers?.hotel || "l’autre hôtel"}. Aucun e-mail.`
                            );
                          }
                        );
                      }}
                    >
                      <label className="block text-xs font-medium text-[#3d4654]">
                        Vers
                        <select
                          value={targetId}
                          onChange={(event) => {
                            setTargetId(event.target.value);
                            setPreview("");
                          }}
                          className="mt-1 w-full rounded-lg border border-[#d9d1c3] bg-white px-2 py-1.5 text-sm text-[#0B192C]"
                        >
                          {destinations.map((hotel) => (
                            <option key={hotel.id} value={hotel.id}>
                              {hotel.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-[#0B192C]">
                        <input
                          type="checkbox"
                          checked={wholeThread}
                          onChange={(event) => {
                            setWholeThread(event.target.checked);
                            setPreview("");
                          }}
                        />
                        Tout le fil Gmail
                      </label>
                      {preview ? <p className="text-xs font-medium text-[#0B192C]">{preview}</p> : null}
                      {moveError ? (
                        <p role="alert" className="text-xs font-semibold text-red-700">
                          {moveError}
                        </p>
                      ) : null}
                      <button type="submit" className="text-xs font-semibold text-[#0B192C] disabled:opacity-50" disabled={moving || !targetId}>
                        {moving ? "…" : preview ? "Déplacer, sans e-mail" : "Aperçu"}
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-xs font-semibold text-[#3d4654]"
                        onClick={() => {
                          setMovingId(null);
                          setPreview("");
                          setMoveError(null);
                        }}
                      >
                        Annuler
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 ml-2 inline-flex min-h-11 items-center rounded-full border border-[#0B192C] px-3 text-sm font-semibold text-[#0B192C]"
                      onClick={() => {
                        setMovingId(turn.reply?.threadId || null);
                        setTargetId(destinations[0]?.id || "");
                        setWholeThread(false);
                        setPreview("");
                        setMoveError(null);
                      }}
                    >
                      Déplacer
                    </button>
                  )
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
