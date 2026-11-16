"use client";

import { useCallback, useEffect, useState } from "react";
import { TRIP_PROPOSAL_WAIT_MS, type OutgoingLine } from "@/lib/crm/trip-costs";

export type TripProposalStatus = "loading" | "ready" | "error";

export function attachedCostStamp(
  view: { lines: { costs: { id: string }[] }[]; unsold: { id: string }[] } | null | undefined
) {
  if (!view) return null;
  return [...view.lines.flatMap((line) => line.costs.map((cost) => cost.id)), ...view.unsold.map((cost) => cost.id)]
    .sort()
    .join("|");
}

/** Les sorties proposées pour ce dossier. N’écrit rien. Un échec ou un délai laisse réessayer. */
export function useTripProposals(bookingId: string, costStamp: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    stamp: string;
    attempt: number;
    status: "ready" | "error";
    lines: OutgoingLine[];
  } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const status: TripProposalStatus =
    costStamp == null
      ? "ready"
      : result && result.stamp === costStamp && result.attempt === attempt
        ? result.status
        : "loading";
  const lines = status === "ready" && result ? result.lines : [];

  useEffect(() => {
    if (costStamp == null) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TRIP_PROPOSAL_WAIT_MS);
    let gone = false;
    const stamp = costStamp;
    const run = attempt;
    (async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${bookingId}/sorties`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as { proposed?: OutgoingLine[] } | null;
        if (gone) return;
        if (!res.ok || !Array.isArray(json?.proposed)) {
          setResult({ stamp, attempt: run, status: "error", lines: [] });
          return;
        }
        setResult({ stamp, attempt: run, status: "ready", lines: json.proposed });
      } catch {
        if (!gone) setResult({ stamp, attempt: run, status: "error", lines: [] });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [bookingId, costStamp, attempt]);

  return { status, lines, retry };
}
