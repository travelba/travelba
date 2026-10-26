"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HotelMailTo } from "@/components/admin/HotelMailTo";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import type { DeskRosterPerson } from "@/lib/crm/hotel-desk";

const fieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-[#faf9f6] px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C] focus:bg-white";

/** Brouillon de relance. L’envoi attend le second clic. */
export function HotelFollowUp({
  bookingId,
  itemId,
  requestId,
  messageId,
  people,
  recipients,
  subject: initialSubject,
  body: initialBody,
  onClose,
}: {
  bookingId: string;
  itemId: string;
  requestId: string | null;
  messageId: string | null;
  people: DeskRosterPerson[];
  recipients: string[];
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [selected, setSelected] = useState(recipients);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-desk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "relance",
        itemId,
        requestId,
        messageId,
        subject,
        body,
        recipients: selected,
      }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      const message = json?.error || "La relance n’a pas pu partir.";
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
      aria-label="Relance"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6f552c]">Relance</p>
      <p className="text-sm text-[#3d4654]">Même fil. Rien ne part avant la confirmation.</p>
      <HotelMailTo people={people} selected={selected} onChange={setSelected} fieldClassName={fieldClass} />
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
          label="Envoyer la relance"
          confirmLabel="Envoyer"
          question="Envoyer cette relance aux adresses cochées ?"
          busyLabel="Envoi de la relance…"
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
