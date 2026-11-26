"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConciergeQualityRecord() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function record() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/concierge/qualite", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string; total?: number; reussis?: number } | null;
      if (!response.ok) {
        setNote(payload?.error || "Le passage n’a pas été enregistré.");
        return;
      }
      setNote(`${payload?.reussis ?? 0} scénarios sur ${payload?.total ?? 0} sont au vert.`);
      router.refresh();
    } catch {
      setNote("Le passage n’a pas été enregistré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={busy} onClick={() => void record()}>
        {busy ? "Passage en cours…" : "Enregistrer un passage"}
      </button>
      <p className="text-sm text-muted">Le routeur répond aux dossiers fictifs. Aucun message ne part, aucun client n’est lu.</p>
      {note ? <p className="text-sm">{note}</p> : null}
    </div>
  );
}
