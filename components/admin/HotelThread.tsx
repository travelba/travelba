"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { fieldControlClass } from "@/components/crm/fields";
import {
  hotelStayContext,
  hotelThread,
  knownHotelRecipients,
  type HotelMailPiece,
} from "@/lib/crm/hotel-desk";
import { formatDateTimeFr } from "@/lib/crm/money";
import type { CrmBookingItem, CrmHotelMessage, CrmHotelRequest } from "@/lib/crm/types";

export function HotelThread({
  bookingId,
  item,
  requests,
  messages,
  attached,
}: {
  bookingId: string;
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  messages: CrmHotelMessage[];
  attached: HotelMailPiece[];
}) {
  const router = useRouter();
  const logRef = useRef<HTMLOListElement>(null);
  const context = hotelStayContext(item);
  const canWrite = knownHotelRecipients(item, requests).length > 0;
  const [subject, setSubject] = useState(context.subject);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<CrmHotelMessage[]>([]);
  const [syncedMessages, setSyncedMessages] = useState(messages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (messages !== syncedMessages) {
    setSyncedMessages(messages);
    setSent([]);
  }
  const turns = hotelThread({ item, requests, messages: [...messages, ...sent], attached });

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns.length]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send-message", itemId: item.id, subject, body }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res.ok) {
      setError(json?.error || "L'envoi a échoué.");
      return;
    }
    setSent((current) => [
      ...current,
      {
        id: `local-${current.length}`,
        booking_id: bookingId,
        booking_item_id: item.id,
        subject: subject.trim(),
        body: body.trim(),
        recipients: [],
        sent_at: new Date().toISOString(),
        reply_from: "",
        reply_subject: "",
        reply_body: "",
        reply_message_id: null,
        replied_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    setBody("");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white" aria-label={`Échanges avec ${context.hotel}`}>
      <header className="border-b border-[var(--border)] px-3 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Avec l’hôtel</p>
        <p className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">{context.hotel}</p>
        {context.subtitle ? <p className="text-xs text-muted">{context.subtitle}</p> : null}
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
                    ? "ml-6 rounded-2xl bg-[var(--admin-navy)] px-3 py-3 text-white"
                    : "mr-6 rounded-2xl border border-[var(--border)] bg-[#f8f3eb] px-3 py-3 text-[var(--admin-navy)]"
                }
              >
                <p
                  className={
                    outbound
                      ? "text-[10px] font-bold uppercase tracking-[0.14em] text-[#e6d3b3]"
                      : "text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]"
                  }
                >
                  {turn.speaker} · {turn.label}
                </p>
                {turn.subject ? (
                  <p className={`mt-1 text-xs font-semibold ${outbound ? "text-[#e6d3b3]" : ""}`}>{turn.subject}</p>
                ) : null}
                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{turn.body}</p>
                {turn.link ? (
                  <a
                    href={turn.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-sm font-semibold text-[#9e7e51] underline"
                  >
                    {turn.link}
                  </a>
                ) : null}
                {turn.at ? (
                  <p className={outbound ? "mt-1 text-xs text-[#e6d3b3]" : "mt-1 text-xs text-muted"}>
                    {formatDateTimeFr(turn.at)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-3 py-4 text-sm text-muted">Aucun échange avec cet hôtel pour l’instant.</p>
      )}
      {canWrite ? (
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-2 border-t border-[var(--border)] px-3 py-3">
          <label className="block text-xs font-semibold text-[var(--admin-navy)]">
            Objet
            <input
              className={`${fieldControlClass} mt-1`}
              value={subject}
              autoComplete="off"
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-[var(--admin-navy)]">
            Message
            <textarea
              className={`${fieldControlClass} mt-1 min-h-28`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted">Le message part pour ce séjour.</p>
          {busy ? <BusyBar label="Envoi du message" /> : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button type="submit" className="admin-af-btn rounded-full px-3 py-2 text-sm" disabled={busy || !subject.trim() || !body.trim()}>
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      ) : (
        <p className="border-t border-[var(--border)] px-3 py-3 text-sm text-muted">Cet hôtel n’a pas d’adresse connue.</p>
      )}
    </section>
  );
}
