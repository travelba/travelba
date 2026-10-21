"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WhatsappHoldButton } from "@/components/admin/WhatsappHoldButton";

export function WhatsappDesk({
  customerId,
  phone,
  paused,
}: {
  customerId: string | null;
  phone: string | null;
  paused: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState(paused);
  if (!phone) return null;

  async function post(message = "") {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", customerId, phone, text: message }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(payload?.error || "L’envoi n’a pas abouti.");
        return;
      }
      setText("");
      setNote("Message envoyé. Le Concierge se tait jusqu’à demain matin.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-4 space-y-2 border-t border-[var(--border)] pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        void post(text);
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
        {held ? "Repris par l’agence" : "Le Concierge"}
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Votre message au client"
        className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || text.trim().length < 2}
          className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          Envoyer
        </button>
        <WhatsappHoldButton
          phone={phone}
          customerId={customerId}
          held={held}
          className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
          onResult={(result) => {
            setHeld(result.status === "agency");
            if (result.line) setNote(result.line);
            router.refresh();
          }}
        />
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </form>
  );
}
