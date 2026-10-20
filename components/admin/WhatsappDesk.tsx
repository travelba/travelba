"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  if (!phone) return null;

  async function post(action: "reply" | "resume", message = "") {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, customerId, phone, text: message }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(payload?.error || "L’envoi n’a pas abouti.");
        return;
      }
      setText("");
      setNote(
        action === "resume" ? "Le Concierge reprend ce fil." : "Message envoyé. Le Concierge se tait jusqu’à demain matin."
      );
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
        void post("reply", text);
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
        {paused ? "Le Concierge est en pause" : "Répondre à la place du Concierge"}
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
        <button
          type="button"
          disabled={busy}
          onClick={() => void post("resume")}
          className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
        >
          Rendre au Concierge
        </button>
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </form>
  );
}
