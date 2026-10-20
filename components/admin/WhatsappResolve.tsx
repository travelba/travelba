"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WhatsappResolve({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");

  if (done) return <span className="text-sm text-muted">Traitée</span>;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="admin-af-btn admin-tap rounded-full px-3 py-1.5 text-sm"
        onClick={async () => {
          const response = await fetch("/api/admin/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "done", requestId }),
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { error?: string } | null;
            setNote(payload?.error || "Impossible de clôturer.");
            return;
          }
          setDone(true);
          router.refresh();
        }}
      >
        J’ai répondu
      </button>
      {note ? <span className="text-sm text-muted">{note}</span> : null}
    </span>
  );
}
