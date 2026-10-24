"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConciergeFollowupSend({ id, previewBlocked }: { id: string; previewBlocked?: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setNote("");
    const response = await fetch("/api/admin/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-followup", followupId: id }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; sent?: boolean } | null;
    setBusy(false);
    if (!response.ok) {
      setNote(body?.error || "Le message n’est pas parti.");
      return;
    }
    setNote(body?.sent ? "Message envoyé." : "Rien n’est parti.");
    router.refresh();
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy || previewBlocked}
        onClick={() => void send()}
        className="admin-tap rounded-full bg-[#0B192C] px-3 py-1 text-xs font-semibold text-[#C5A880] disabled:opacity-50"
      >
        {busy ? "Envoi…" : "Envoyer au client"}
      </button>
      {note ? <p className="mt-1 text-xs text-[#5c6570]">{note}</p> : null}
    </div>
  );
}
