"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HotelMailTo } from "@/components/admin/HotelMailTo";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import type { DeskRosterPerson } from "@/lib/crm/hotel-desk";

const fieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-[#faf9f6] px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C] focus:bg-white";

/** Brouillon de relance ou de réponse. L’envoi attend le second clic. */
export function HotelFollowUp({
  bookingId,
  itemId,
  mode = "relance",
  requestId,
  messageId,
  threadId = null,
  pieceId = null,
  people,
  recipients,
  ccRecipients = [],
  subject: initialSubject,
  body: initialBody,
  onClose,
}: {
  bookingId: string;
  itemId: string;
  mode?: "relance" | "reponse";
  requestId: string | null;
  messageId: string | null;
  threadId?: string | null;
  pieceId?: string | null;
  people: DeskRosterPerson[];
  recipients: string[];
  ccRecipients?: string[];
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const reply = mode === "reponse";
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [selected, setSelected] = useState(recipients);
  const [copied, setCopied] = useState(ccRecipients);
  const [error, setError] = useState<string | null>(null);
  const showCopy = ccRecipients.length > 0 || (reply && people.length > 1);

  async function send() {
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        reply
          ? {
              action: "repondre",
              itemId,
              threadId,
              pieceId,
              requestId: threadId ? null : requestId,
              messageId: threadId ? null : messageId,
              subject,
              body,
              recipients: selected,
              cc: copied,
            }
          : {
              action: "relance",
              itemId,
              requestId,
              messageId,
              subject,
              body,
              recipients: selected,
              cc: copied,
            }
      ),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      const message = json?.error || (reply ? "La réponse n’a pas pu partir." : "La relance n’a pas pu partir.");
      setError(message);
      return message;
    }
    onClose();
    router.refresh();
  }

  return (
    <form
      className="space-y-2 rounded-2xl border border-[#e5e0d4] bg-white p-3 text-[#0B192C]"
      onSubmit={(event) => event.preventDefault()}
      aria-label={reply ? "Réponse" : "Relance"}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f552c]">{reply ? "Réponse" : "Relance"}</p>
      <p className="text-sm text-[#3d4654]">
        {reply
          ? "Même fil, à l’expéditeur. Les autres personnes du fil sont en copie. Rien ne part avant la confirmation."
          : "Même fil. Les personnes apparues dans le fil sont en copie. Rien ne part avant la confirmation."}
      </p>
      <HotelMailTo
        people={people}
        selected={selected}
        onChange={setSelected}
        fieldClassName={fieldClass}
        legend={reply ? "À" : "Destinataires"}
        hint={reply ? "La réponse part à ces adresses." : "Le message part seulement vers les adresses cochées."}
      />
      {showCopy ? (
        <HotelMailTo
          people={people}
          selected={copied}
          onChange={setCopied}
          fieldClassName={fieldClass}
          legend="Copie"
          hint="Ces adresses reçoivent la copie. Une personne du fil reste dans le message."
        />
      ) : null}
      <label className="block text-xs font-semibold text-[#0B192C]">
        Objet
        <input className={`${fieldClass} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-[#0B192C]">
        Message
        <textarea className={`${fieldClass} mt-1 min-h-40`} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmAction
          label={reply ? "Envoyer la réponse" : "Envoyer la relance"}
          confirmLabel="Envoyer"
          question={
            ccRecipients.length
              ? reply
                ? "Envoyer cette réponse, y compris les personnes du fil ?"
                : "Envoyer cette relance, y compris les personnes du fil ?"
              : reply
                ? "Envoyer cette réponse aux adresses cochées ?"
                : "Envoyer cette relance aux adresses cochées ?"
          }
          busyLabel={reply ? "Envoi de la réponse…" : "Envoi de la relance…"}
          disabled={selected.length === 0 || !subject.trim() || !body.trim()}
          onConfirm={send}
          className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-[#faf9f6] disabled:opacity-50"
        />
        <button type="button" className="min-h-11 px-3 text-sm font-medium text-[#3d4654]" onClick={onClose}>
          Annuler
        </button>
      </div>
    </form>
  );
}
