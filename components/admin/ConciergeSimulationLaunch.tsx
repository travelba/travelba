"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

const BUDGET = 200;
const LIVE_TOTAL = 20;
const TAILLE = 2;
const MAX_LOTS = 40;

type SimulationBody = {
  demandes?: number;
  demandes_cumulees?: number;
  appels_cumules?: number;
  budget?: number;
  message?: string;
  error?: string;
  cle?: string;
  suite?: boolean;
  offset?: number;
  dossiers_faits?: number;
  dossiers_total?: number;
  budget_epuise?: boolean;
};

/** Deux lancements staff. Le vrai Concierge part par lots et reste plafonné. Aucun message ne part. */
export function ConciergeSimulationLaunch() {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveRun, setLiveRun] = useState(false);
  const [faits, setFaits] = useState(0);
  const [total, setTotal] = useState(LIVE_TOTAL);

  async function launchSimulated() {
    setBusy(true);
    setLiveRun(false);
    setNote("");
    try {
      const response = await fetch("/api/admin/concierge/simulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ echantillon: 8, modele: false }),
      });
      const body = (await response.json()) as SimulationBody;
      if (!response.ok) setNote(body.error || body.message || "La simulation n’a pas abouti.");
      else {
        setNote(`${body.demandes ?? 0} demandes notées, moteur simulé. Aucun message envoyé.`);
        router.refresh();
      }
    } catch {
      setNote("La simulation n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  async function launchLive() {
    setBusy(true);
    setLiveRun(true);
    setFaits(0);
    setTotal(LIVE_TOTAL);
    setNote(`0/${LIVE_TOTAL}`);
    let offset = 0;
    let cle: string | undefined;
    let done = 0;
    let shownTotal = LIVE_TOTAL;
    let appels = 0;
    let budget = BUDGET;
    let demandes = 0;
    try {
      for (let lot = 0; lot < MAX_LOTS; lot++) {
        const response = await fetch("/api/admin/concierge/simulation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            echantillon: LIVE_TOTAL,
            modele: true,
            budget: BUDGET,
            taille: TAILLE,
            offset,
            ...(cle ? { batch_key: cle } : {}),
          }),
        });
        const body = (await response.json()) as SimulationBody;
        const nextDone = body.dossiers_faits ?? done;
        shownTotal = body.dossiers_total || shownTotal;
        if (!response.ok) {
          setFaits(nextDone);
          setTotal(shownTotal);
          setNote(`${nextDone}/${shownTotal}. ${body.error || body.message || "Le lot n’a pas abouti."}`);
          return;
        }
        if (nextDone === done && (body.demandes ?? 0) === 0 && body.suite) {
          setFaits(nextDone);
          setTotal(shownTotal);
          setNote(`${nextDone}/${shownTotal}. Le lot n’a pas avancé.`);
          return;
        }
        done = nextDone;
        cle = body.cle || cle;
        offset = body.offset ?? offset;
        appels = body.appels_cumules ?? appels;
        budget = body.budget ?? budget;
        demandes = body.demandes_cumulees ?? demandes;
        setFaits(done);
        setTotal(shownTotal);
        setNote(`${done}/${shownTotal}`);
        router.refresh();
        if (!body.suite) {
          setNote(
            body.budget_epuise
              ? `${done}/${shownTotal}. Budget de ${budget} appels atteint. ${appels} appels consommés. Aucun message envoyé.`
              : `${done}/${shownTotal}. ${demandes} demandes. ${appels} appels consommés sur ${budget}. Aucun message envoyé.`
          );
          return;
        }
      }
      setNote(`${done}/${shownTotal}. Relancer reprend les dossiers qui restent. Aucun message envoyé.`);
    } catch {
      setNote(`${done}/${shownTotal}. Le lot n’a pas abouti.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        Budget du vrai Concierge : {BUDGET} appels, 20 dossiers au plus. Les dossiers partent par lots de {TAILLE}.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="admin-af-btn" onClick={() => launchSimulated()} disabled={busy}>
          {busy && !liveRun ? "Simulation…" : "Lancer 8 dossiers"}
        </button>
        <button type="button" className="admin-af-btn-accent" onClick={() => launchLive()} disabled={busy}>
          {busy && liveRun ? "Simulation…" : "Lancer 20 dossiers avec le vrai Concierge"}
        </button>
      </div>
      {busy ? (
        <BusyBar label={note || "Simulation…"} value={liveRun && total > 0 ? (faits / total) * 100 : null} />
      ) : note ? (
        <p className="text-sm text-muted">{note}</p>
      ) : null}
    </div>
  );
}
