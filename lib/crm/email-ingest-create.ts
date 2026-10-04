import { decideEmailIngestAction, usableCustomerEmail, type EmailIngestDecision } from "@/lib/crm/email-match";
import {
  isCancellationExtract,
  parseExtractPayloadSafe,
  type BookingExtract,
} from "@/lib/crm/ingest-types";
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
  supplier_email: "Création automatique en attente : l’e-mail lu est celui du fournisseur.",
  quote: "Devis : le dossier n’est pas créé automatiquement.",
  thin: "Création automatique en attente : il manque une carte ou une date.",
} as const;

export type AutoCreateHold = keyof typeof AUTO_CREATE_HOLDS | "apply" | "review" | "cancellation" | "identity";

export type AutoCreatePlan =
  | { kind: "create"; customerId: string }
  | { kind: "create_customer"; firstName: string; lastName: string; email: string };

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
  createCustomer: (input: { firstName: string; lastName: string; email: string }) => Promise<string>;
  persist: (customerId: string) => Promise<{ id: string }>;
  markCreated: (bookingId: string, customerId: string) => Promise<void>;
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

function hasCardAndDate(extract: BookingExtract) {
  const card = (extract.items || []).some(
    (item) => countsAsCarnetCard(item.kind) && (item.title || "").trim()
  );
  if (!card) return false;
  if ((extract.start_date || "").trim() || (extract.end_date || "").trim()) return true;
  return (extract.items || []).some((item) => (item.start_at || "").trim() || (item.end_at || "").trim());
}

/**
 * Création seulement. Un voyage déjà reconnu, une annulation, un devis,
 * une pièce d’identité ou un extrait trop mince restent en relecture.
 */
export function autoCreatePlan(input: {
  extract: BookingExtract;
  decision: EmailIngestDecision;
  fromEmail?: string | null;
}): { plan: AutoCreatePlan; hold: null; message: null } | { plan: null; hold: AutoCreateHold; message: string | null } {
  const { extract, decision } = input;
  if (isCancellationExtract(extract) || extract.document_status === "cancelled") {
    return { plan: null, hold: "cancellation", message: null };
  }
  if (extract.document_status === "identity") {
    return { plan: null, hold: "identity", message: null };
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
  const email = clientEmailForAutoCreate(decision.email, input.fromEmail);
  if (!email) {
    const raw = usableCustomerEmail(decision.email);
    const hold = raw && (isSupplierCustomerEmail(raw) || raw === (input.fromEmail || "").trim().toLowerCase())
      ? "supplier_email"
      : "missing_email";
    return { plan: null, hold, message: AUTO_CREATE_HOLDS[hold] };
  }
  return {
    plan: {
      kind: "create_customer",
      firstName: decision.firstName,
      lastName: decision.lastName,
      email,
    },
    hold: null,
    message: null,
  };
}

export async function runEmailAutoCreate(
  row: AutoCreateRow,
  handlers: AutoCreateHandlers
): Promise<{ created: boolean; bookingId: string | null; hold: AutoCreateHold | null }> {
  if (row.created_booking_id || row.status === "attached" || row.status === "refused") {
    return { created: false, bookingId: row.created_booking_id || null, hold: null };
  }
  if (row.status !== "parsed" && row.status !== "matched") {
    return { created: false, bookingId: null, hold: null };
  }
  const extract = parseExtractPayloadSafe(row.extract);
  const decision = decideEmailIngestAction({
    extract,
    suggestedCustomerId: row.suggested_customer_id || null,
    suggestedBookingId: row.suggested_booking_id || null,
    candidates: row.candidates || [],
  });
  const outcome = autoCreatePlan({ extract, decision, fromEmail: row.from_email });
  if (!outcome.plan) {
    if (outcome.message) await handlers.hold(outcome.message);
    return { created: false, bookingId: null, hold: outcome.hold };
  }
  try {
    const customerId =
      outcome.plan.kind === "create"
        ? outcome.plan.customerId
        : (await handlers.findCustomerByEmail(outcome.plan.email)) ||
          (await handlers.createCustomer({
            firstName: outcome.plan.firstName,
            lastName: outcome.plan.lastName,
            email: outcome.plan.email,
          }));
    const booking = await handlers.persist(customerId);
    await handlers.markCreated(booking.id, customerId);
    return { created: true, bookingId: booking.id, hold: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Création automatique impossible";
    await handlers.fail(message);
    return { created: false, bookingId: null, hold: null };
  }
}
