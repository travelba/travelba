import {
  SAME_DESTINATION_CANCELLED_REASON,
  SAME_DESTINATION_REASON,
  STRONG_BOOKING_SCORE,
  blocksSecondDossier,
  decideEmailIngestAction,
  usableCustomerEmail,
  type EmailIngestDecision,
} from "@/lib/crm/email-match";
import {
  isCancellationExtract,
  parseExtractPayloadSafe,
  type BookingExtract,
} from "@/lib/crm/ingest-types";
import {
  cancellationApplyPlan,
  cancellationIsSettled,
  replacementPlan,
  type LifecycleCard,
} from "@/lib/crm/item-lifecycle";
import { countsAsCarnetCard, type EmailIngestCandidate } from "@/lib/crm/types";

/** Domaines fournisseur : jamais une adresse de compte client. */
const SUPPLIER_EMAIL_DOMAINS = [
  "littleemperors.com",
  "expedia.com",
  "expediagroup.com",
  "expediapartnercentral.com",
  "amadeus.com",
];

export const AUTO_CREATE_HOLDS = {
  missing_email: "Création automatique en attente : le mail n’a pas d’e-mail client.",
  missing_name: "Création automatique en attente : le mail n’a pas de nom de voyageur.",
  supplier_email: "Création automatique en attente : l’e-mail lu est celui du fournisseur.",
  quote: "Devis : le dossier n’est pas créé automatiquement.",
  thin: "Création automatique en attente : il manque une carte ou une date.",
  same_stay: "Même client, même destination : le dossier n’est pas créé. Remplacez la carte sur le séjour existant.",
} as const;

const OBSOLETE_EMAIL_HOLDS = new Set<string>([
  AUTO_CREATE_HOLDS.missing_email,
  AUTO_CREATE_HOLDS.supplier_email,
]);

/** Ancien arrêt : pas d’e-mail voyageur. La fiche se crée maintenant avec le nom seul. */
export function hasObsoleteEmailHold(
  warnings: { message?: string | null }[] | null | undefined
) {
  return (warnings || []).some(
    (warning) => typeof warning?.message === "string" && OBSOLETE_EMAIL_HOLDS.has(warning.message)
  );
}

export function withoutObsoleteEmailHold<T extends { message?: string | null }>(
  warnings: T[] | null | undefined
) {
  return (warnings || []).filter(
    (warning) => typeof warning?.message !== "string" || !OBSOLETE_EMAIL_HOLDS.has(warning.message)
  );
}

export const AUTO_STAY_NOTE = "Itinéraire mis à jour depuis le mail.";

export type AutoCreateHold = keyof typeof AUTO_CREATE_HOLDS | "apply" | "review" | "cancellation" | "identity";

export type AutoCreatePlan =
  | { kind: "create"; customerId: string }
  | { kind: "create_customer"; firstName: string; lastName: string; email: string | null }
  | { kind: "apply_stay"; bookingId: string; customerId: string; gesture: "replace" | "cancel" };

export type AutoCreateRow = {
  status: string;
  from_email?: string | null;
  created_booking_id?: string | null;
  extract: unknown;
  suggested_customer_id?: string | null;
  suggested_booking_id?: string | null;
  candidates?: EmailIngestCandidate[] | null;
};

export type AutoCreateHandlers = {
  findCustomerByEmail: (email: string) => Promise<string | null>;
  createCustomer: (input: { firstName: string; lastName: string; email: string | null }) => Promise<string>;
  persist: (customerId: string) => Promise<{ id: string }>;
  markCreated: (bookingId: string, customerId: string) => Promise<void>;
  loadItems?: (bookingId: string) => Promise<LifecycleCard[]>;
  applyStay?: (input: {
    bookingId: string;
    customerId: string;
    gesture: "replace" | "cancel";
  }) => Promise<void>;
  markApplied?: (bookingId: string, customerId: string) => Promise<void>;
  hold: (message: string) => Promise<void>;
  fail: (message: string) => Promise<void>;
};

function emailDomain(email: string) {
  return email.split("@")[1] || "";
}

export function isSupplierCustomerEmail(email: string | null | undefined) {
  const value = usableCustomerEmail(email);
  if (!value) return false;
  const domain = emailDomain(value);
  return SUPPLIER_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`));
}

/** E-mail de fiche : ni boîte agence, ni expéditeur du mail, ni domaine fournisseur. */
export function clientEmailForAutoCreate(
  email: string | null | undefined,
  fromEmail: string | null | undefined
) {
  const value = usableCustomerEmail(email);
  if (!value || isSupplierCustomerEmail(value)) return null;
  const from = usableCustomerEmail(fromEmail) || (fromEmail || "").trim().toLowerCase();
  if (from && value === from) return null;
  return value;
}

const DESTINATION_REASONS = new Set([SAME_DESTINATION_REASON, SAME_DESTINATION_CANCELLED_REASON]);

/** Un seul séjour : référence forte, ou une seule destination. Deux villes identiques : rien. */
export function uniqueStayTarget(candidates: EmailIngestCandidate[]) {
  const bookings = candidates.filter((row) => row.booking_id && row.customer_id);
  const destinationIds = new Set(
    bookings.filter((row) => DESTINATION_REASONS.has(row.reason)).map((row) => row.booking_id as string)
  );
  if (destinationIds.size > 1) return null;
  const strongIds = new Set(
    bookings.filter((row) => row.score >= STRONG_BOOKING_SCORE).map((row) => row.booking_id as string)
  );
  if (strongIds.size > 1) return null;
  if (strongIds.size === 1) {
    const bookingId = [...strongIds][0];
    if (destinationIds.size === 1 && !destinationIds.has(bookingId)) return null;
    const row = bookings.find((candidate) => candidate.booking_id === bookingId);
    if (!row?.customer_id) return null;
    return { bookingId, customerId: row.customer_id };
  }
  if (destinationIds.size !== 1) return null;
  const bookingId = [...destinationIds][0];
  const others = bookings.filter((row) => row.booking_id !== bookingId);
  if (others.length) return null;
  const row = bookings.find((candidate) => candidate.booking_id === bookingId);
  if (!row?.customer_id) return null;
  return { bookingId, customerId: row.customer_id };
}

function stayApplyPlan(input: {
  extract: BookingExtract;
  candidates?: EmailIngestCandidate[] | null;
  items?: LifecycleCard[] | null;
}): AutoCreatePlan | null {
  if (input.extract.document_status === "quote" || input.extract.document_status === "identity") return null;
  const target = uniqueStayTarget(input.candidates || []);
  if (!target || !input.items) return null;
  if (isCancellationExtract(input.extract) || input.extract.document_status === "cancelled") {
    const plan = cancellationApplyPlan(input.extract, input.items);
    if (!cancellationIsSettled(plan)) return null;
    return { kind: "apply_stay", ...target, gesture: "cancel" };
  }
  if (input.extract.document_status !== "confirmed") return null;
  if (!hasCardAndDate(input.extract)) return null;
  const plan = replacementPlan(input.extract.items || [], input.items);
  if (plan.choices.length) return null;
  if (!plan.updates.length && !plan.replacements.length && !plan.adds) return null;
  return { kind: "apply_stay", ...target, gesture: "replace" };
}

function hasCardAndDate(extract: BookingExtract) {
  const card = (extract.items || []).some(
    (item) => countsAsCarnetCard(item.kind) && (item.title || "").trim()
  );
  if (!card) return false;
  if ((extract.start_date || "").trim() || (extract.end_date || "").trim()) return true;
  return (extract.items || []).some((item) => (item.start_at || "").trim() || (item.end_at || "").trim());
}

/**
 * Crée le premier dossier, ou met à jour le séjour quand le rapprochement est unique.
 * Ambigu, devis, identité ou extrait mince : la file attend.
 */
export function autoCreatePlan(input: {
  extract: BookingExtract;
  decision: EmailIngestDecision;
  fromEmail?: string | null;
  candidates?: EmailIngestCandidate[] | null;
  items?: LifecycleCard[] | null;
}): { plan: AutoCreatePlan; hold: null; message: null } | { plan: null; hold: AutoCreateHold; message: string | null } {
  const { extract, decision } = input;
  const stay = stayApplyPlan(input);
  if (stay) return { plan: stay, hold: null, message: null };
  if (isCancellationExtract(extract) || extract.document_status === "cancelled") {
    return { plan: null, hold: "cancellation", message: null };
  }
  if (extract.document_status === "identity") {
    return { plan: null, hold: "identity", message: null };
  }
  if (
    blocksSecondDossier(input.candidates || [])
  ) {
    return { plan: null, hold: "same_stay", message: AUTO_CREATE_HOLDS.same_stay };
  }
  if (decision.kind === "apply") return { plan: null, hold: "apply", message: null };
  if (decision.kind === "review") return { plan: null, hold: "review", message: null };
  if (extract.document_status === "quote") {
    return { plan: null, hold: "quote", message: AUTO_CREATE_HOLDS.quote };
  }
  if (!hasCardAndDate(extract)) {
    return { plan: null, hold: "thin", message: AUTO_CREATE_HOLDS.thin };
  }
  if (decision.kind === "create") {
    return { plan: { kind: "create", customerId: decision.customerId }, hold: null, message: null };
  }
  const firstName = (decision.firstName || "").trim();
  const lastName = (decision.lastName || "").trim();
  if (!firstName || !lastName) {
    return { plan: null, hold: "missing_name", message: AUTO_CREATE_HOLDS.missing_name };
  }
  return {
    plan: {
      kind: "create_customer",
      firstName,
      lastName,
      email: clientEmailForAutoCreate(decision.email, input.fromEmail),
    },
    hold: null,
    message: null,
  };
}

export async function runEmailAutoCreate(
  row: AutoCreateRow,
  handlers: AutoCreateHandlers
): Promise<{ created: boolean; applied: boolean; bookingId: string | null; hold: AutoCreateHold | null }> {
  if (row.created_booking_id || row.status === "attached" || row.status === "refused") {
    return { created: false, applied: false, bookingId: row.created_booking_id || null, hold: null };
  }
  if (row.status !== "parsed" && row.status !== "matched") {
    return { created: false, applied: false, bookingId: null, hold: null };
  }
  const extract = parseExtractPayloadSafe(row.extract);
  const candidates = row.candidates || [];
  const decision = decideEmailIngestAction({
    extract,
    suggestedCustomerId: row.suggested_customer_id || null,
    suggestedBookingId: row.suggested_booking_id || null,
    candidates,
  });
  const target = uniqueStayTarget(candidates);
  let items: LifecycleCard[] | null = null;
  if (target && handlers.loadItems) {
    try {
      items = await handlers.loadItems(target.bookingId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lecture du séjour impossible";
      await handlers.fail(message);
      return { created: false, applied: false, bookingId: null, hold: null };
    }
  }
  const outcome = autoCreatePlan({
    extract,
    decision,
    fromEmail: row.from_email,
    candidates,
    items,
  });
  if (!outcome.plan) {
    if (outcome.message) await handlers.hold(outcome.message);
    return { created: false, applied: false, bookingId: null, hold: outcome.hold };
  }
  try {
    if (outcome.plan.kind === "apply_stay") {
      if (!handlers.applyStay || !handlers.markApplied) {
        await handlers.fail("Mise à jour automatique impossible.");
        return { created: false, applied: false, bookingId: null, hold: null };
      }
      await handlers.applyStay({
        bookingId: outcome.plan.bookingId,
        customerId: outcome.plan.customerId,
        gesture: outcome.plan.gesture,
      });
      await handlers.markApplied(outcome.plan.bookingId, outcome.plan.customerId);
      return {
        created: false,
        applied: true,
        bookingId: outcome.plan.bookingId,
        hold: null,
      };
    }
    const customerId =
      outcome.plan.kind === "create"
        ? outcome.plan.customerId
        : (outcome.plan.email ? await handlers.findCustomerByEmail(outcome.plan.email) : null) ||
          (await handlers.createCustomer({
            firstName: outcome.plan.firstName,
            lastName: outcome.plan.lastName,
            email: outcome.plan.email,
          }));
    const booking = await handlers.persist(customerId);
    await handlers.markCreated(booking.id, customerId);
    return { created: true, applied: false, bookingId: booking.id, hold: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Création automatique impossible";
    await handlers.fail(message);
    return { created: false, applied: false, bookingId: null, hold: null };
  }
}
