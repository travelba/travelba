"use client";

import { useState } from "react";

/** Lance un échantillon sans modèle payant. Aucun message ne part. */
export function ConciergeSimulationLaunch() {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/concierge/simulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ echantillon: 8, modele: false }),
      });
      const body = (await response.json()) as { demandes?: number; error?: string; message?: string };
      setNote(response.ok ? `${body.demandes ?? 0} demandes notées. Aucun message envoyé.` : body.message || body.error || "La simulation n’a pas abouti.");
    } catch {
      setNote("La simulation n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="admin-af-btn" onClick={launch} disabled={busy}>
        {busy ? "Simulation…" : "Lancer 8 dossiers"}
      </button>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
