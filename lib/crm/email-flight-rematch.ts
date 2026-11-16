import { after } from "next/server";

let depth = 0;
let queued = false;

/** Le rematch en cours ne se relance pas lui-même. */
export function enterFlightRematch() {
  depth += 1;
}

export function leaveFlightRematch() {
  depth = Math.max(0, depth - 1);
}

/**
 * Après la réponse : un lot court de mails en attente.
 * Hors requête (test, script), on n’attend pas et on ne bloque pas l’appelant.
 */
export function schedulePendingFlightRematch() {
  if (depth > 0 || queued) return;
  queued = true;
  try {
    after(async () => {
      queued = false;
      try {
        const { rematchStoredEmailIngest } = await import("@/lib/crm/email-ingest");
        await rematchStoredEmailIngest(8);
      } catch (err) {
        console.error("[import] rematch file", err instanceof Error ? err.message : "");
      }
    });
  } catch {
    queued = false;
  }
}
