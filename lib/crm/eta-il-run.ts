import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openEtaIlPortal } from "./eta-il-browser";
import type { EtaIlDraft, EtaIlPhase } from "./eta-il-draft";
import { portalEvent, safePortalLabel, stepAfterPortalRun, type PortalLogKind } from "./eta-il-log";
import { clearPortalEvents, writePortalEvent } from "./eta-il-log-store";
import { redactPassportNumbers, runEtaIlSession } from "./eta-il-session";
import type { ClientVisaStep } from "./visa-flow";
import { ensureIlPliantCard } from "./visa-card";
import { euroRates } from "./visa-ecb";

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
}): Promise<{
  phase: EtaIlPhase | "paiement";
  summary: string | null;
  message: string | null;
  ceilingEur: number | null;
  fee: string | null;
}> {
  const numbers = opts.draft.applicants.map((row) => row.number);
  const log = async (kind: PortalLogKind, text: string) => {
    await writePortalEvent(opts.db, opts.bookingId, portalEvent(kind, redactPassportNumbers(text, numbers)));
  };

  if (!opts.apiKey) {
    await clearPortalEvents(opts.db, opts.bookingId);
    await log("erreur", ASTRA_MISSING);
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: ASTRA_MISSING, ceilingEur: null, fee: null };
  }

  const locked = await markStep(opts.db, opts.bookingId, "remplissage", opts.fromSteps);
  if (!locked) return { phase: "prêt", summary: null, message: null, ceilingEur: null, fee: null };

  await clearPortalEvents(opts.db, opts.bookingId);
  await log("attente", "Ouverture du portail ETA-IL.");

  const opened = await openEtaIlPortal();
  if (!opened.ok) {
    await log("echec", opened.message);
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: opened.message, ceilingEur: null, fee: null };
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
    const card = session.filled ? await issueFilledCard(opts.db, opts.bookingId, opts.draft.applicants.length) : null;
    const next = stepAfterPortalRun(session.phase, Boolean(card?.issued));
    await markStep(opts.db, opts.bookingId, next, ["remplissage"]);
    if (card?.issued) {
      await log("fini", session.summary ? `${card.journal} ${session.summary}` : card.journal);
      return {
        phase: "paiement",
        summary: session.summary,
        message: null,
        ceilingEur: card.ceilingEur,
        fee: `${card.feeIls} ILS`,
      };
    }
    if (session.phase === "à confirmer") {
      await log(card?.level || "fini", card?.journal || session.summary || "Formulaire prêt. Confirmation avant l’envoi.");
    } else {
      await log("erreur", session.message || "Le remplissage n’a pas abouti.");
    }
    return {
      phase: session.phase,
      summary: session.summary,
      message: card?.journal || session.message,
      ceilingEur: card?.ceilingEur ?? null,
      fee: card ? `${card.feeIls} ILS` : null,
    };
  } catch (err) {
    console.error("[eta-il]", err instanceof Error ? err.message : "échec");
    await log("erreur", "Le remplissage n’a pas abouti.");
    await markStep(opts.db, opts.bookingId, "preparation", ["remplissage"]);
    return { phase: "bloqué", summary: null, message: "Le remplissage n’a pas abouti.", ceilingEur: null, fee: null };
  } finally {
    await portal.close();
  }
}

async function issueFilledCard(
  db: Parameters<typeof ensureIlPliantCard>[0]["db"],
  bookingId: string,
  travelerCount: number
) {
  const { data: booking } = await db
    .from("crm_bookings")
    .select("reference, start_date, end_date, customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  const row = booking as { reference?: string; start_date?: string | null; end_date?: string | null; customer_id?: string } | null;
  if (!row?.customer_id) return null;
  const { data: customer } = await db
    .from("crm_customers")
    .select("first_name, last_name")
    .eq("id", row.customer_id)
    .maybeSingle();
  const holder = customer as { first_name?: string | null; last_name?: string | null } | null;
  const fx = await euroRates();
  return ensureIlPliantCard({
    db,
    bookingId,
    customerId: row.customer_id,
    firstName: holder?.first_name || "Client",
    lastName: holder?.last_name || "Travelba",
    travelerCount,
    bookingReference: row.reference || bookingId,
    startDate: row.start_date,
    endDate: row.end_date,
    rates: fx.rates,
  });
}
