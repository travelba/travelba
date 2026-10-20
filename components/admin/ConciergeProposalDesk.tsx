"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConciergeProposalDesk({ id, draft }: { id: string; draft: string }) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [note, setNote] = useState("");

  async function post(action: "approve" | "reject" | "edit") {
    setNote("");
    const response = await fetch("/api/admin/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, proposalId: id, edited: text }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; sent?: boolean } | null;
    if (!response.ok) {
      setNote(body?.error || "La décision n’a pas abouti.");
      return;
    }
    setNote(body?.sent ? "Message envoyé." : "Décision enregistrée. Aucun message n’est parti.");
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        className="w-full rounded-2xl border border-[var(--border)] px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-af-btn admin-tap rounded-full px-3 py-1.5 text-sm" onClick={() => void post("approve")}>
          Approuver
        </button>
        <button type="button" className="admin-af-btn admin-tap rounded-full px-3 py-1.5 text-sm" onClick={() => void post("edit")}>
          Enregistrer le texte
        </button>
        <button type="button" className="admin-af-btn admin-tap rounded-full px-3 py-1.5 text-sm" onClick={() => void post("reject")}>
          Refuser
        </button>
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
