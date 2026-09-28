import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openEtaIlPortal } from "./eta-il-browser";
import type { EtaIlDraft, EtaIlPhase } from "./eta-il-draft";
import { portalEvent, safePortalLabel, stepAfterPortalRun, type PortalLogKind } from "./eta-il-log";
import { clearPortalEvents, writePortalEvent } from "./eta-il-log-store";
import { redactPassportNumbers, runEtaIlSession } from "./eta-il-session";
import type { ClientVisaStep } from "./visa-flow";

const ASTRA_MISSING = "GPT-6 Astra n’est pas disponible sur ce compte API.";

async function markStep(db: SupabaseClient, bookingId: string, step: ClientVisaStep, from: ClientVisaStep[]) {
  const { data } = await db
    .from("crm_visa_requests")
    .update({ step })
    .eq("booking_id", bookingId)
    .eq("country", "IL")
    .in("step", from)
    .select("step");
  return Boolean(data?.length);
}

/** Remplit le portail. En cas d’échec, le dossier quitte Remplissage et le journal agence garde la cause. */
export async function executeEtaIlFill(opts: {
  db: SupabaseClient;
  bookingId: string;
  apiKey: string | null;
  draft: EtaIlDraft;
  fromSteps: ClientVisaStep[];
}): Promise<{ phase: EtaIlPhase; summary: string | null; message: string | null }> {
  const numbers = opts.draft.applicants.map((row) => row.number);
  const log = async (kind: PortalLogKind, text: string) => {
    await writePortalEvent(opts.db, opts.bookingId, portalEvent(kind, redactPassportNumbers(text, numbers)));
  };

  if (!opts.apiKey) {
    await clearPortalEvents(opts.db, opts.bookingId);
    await log("erreur", ASTRA_MISSING);
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: ASTRA_MISSING };
  }

  const locked = await markStep(opts.db, opts.bookingId, "remplissage", opts.fromSteps);
  if (!locked) return { phase: "prêt", summary: null, message: null };

  await clearPortalEvents(opts.db, opts.bookingId);
  await log("attente", "Ouverture du portail ETA-IL.");

  const opened = await openEtaIlPortal();
  if (!opened.ok) {
    await log("echec", opened.message);
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: opened.message };
  }

  const portal = opened.session;
  await log("ouvert", `Portail ouvert · ${safePortalLabel(portal.url())}`);
  try {
    const session = await runEtaIlSession({
      apiKey: opts.apiKey,
      draft: opts.draft,
      page: portal,
      onEvent: async (event) => {
        await writePortalEvent(opts.db, opts.bookingId, portalEvent(event.kind, redactPassportNumbers(event.text, numbers), event.at));
      },
    });
    const next = stepAfterPortalRun(session.phase);
    await markStep(opts.db, opts.bookingId, next, ["remplissage"]);
    if (session.phase === "à confirmer") {
      await log("fini", session.summary || "Formulaire prêt. Confirmation avant l’envoi.");
    } else {
      await log("erreur", session.message || "Le remplissage n’a pas abouti.");
    }
    return session;
  } catch (err) {
    console.error("[eta-il]", err instanceof Error ? err.message : "échec");
    await log("erreur", "Le remplissage n’a pas abouti.");
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: "Le remplissage n’a pas abouti." };
  } finally {
    await portal.close();
  }
}
