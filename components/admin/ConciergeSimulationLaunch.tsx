"use client";

import { useState } from "react";

const BUDGET = 200;

/** Deux lancements staff. Le vrai Concierge est plafonné. Aucun message ne part. */
export function ConciergeSimulationLaunch() {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function launch(modele: boolean) {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/concierge/simulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(modele ? { echantillon: 20, modele: true, budget: BUDGET } : { echantillon: 8, modele: false }),
      });
      const body = (await response.json()) as {
        demandes?: number;
        appels?: number;
        budget?: number;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setNote(body.message || body.error || "La simulation n’a pas abouti.");
      } else if (modele) {
        setNote(`${body.demandes ?? 0} demandes. ${body.appels ?? 0} appels consommés sur ${body.budget ?? BUDGET}. Aucun message envoyé.`);
      } else {
        setNote(`${body.demandes ?? 0} demandes notées, moteur simulé. Aucun message envoyé.`);
      }
    } catch {
      setNote("La simulation n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Budget du vrai Concierge : {BUDGET} appels, 20 dossiers au plus.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="admin-af-btn" onClick={() => launch(false)} disabled={busy}>
          {busy ? "Simulation…" : "Lancer 8 dossiers"}
        </button>
        <button type="button" className="admin-af-btn-accent" onClick={() => launch(true)} disabled={busy}>
          Lancer 20 dossiers avec le vrai Concierge
        </button>
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
    </div>
  );
}
