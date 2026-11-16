import { clientEmailForAutoCreate } from "@/lib/crm/email-ingest-create";
import { extractPeople, extractPrimaryPerson, extractReferences } from "@/lib/crm/email-match";
import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import { suppressionMatches, SUPPRESSED_DOSSIER, type SuppressionRow } from "@/lib/crm/booking-suppression";
import { countsAsCarnetCard } from "@/lib/crm/types";
import {
  DIFFERENT_CLIENT_HOLD,
  incomingTrip,
  reunionPlan,
  type ReunionOptions,
  type ReunionProposal,
  type TripDossier,
  type TripPerson,
} from "@/lib/crm/trip-match";

export const INBOX_HOLDS = {
  thin: "Ce message n’a pas donné de carte. La file le garde.",
  unread: "Le billet électronique n’a pas pu être lu.",
  identity: "Pièce d’identité : elle reste dans la file, sans dossier.",
  quote: "Devis : le dossier n’est pas créé.",
  cancellation: "Annulation : elle n’ouvre pas de dossier.",
  unnamed: "Le client n’est pas reconnu. La file attend un nom.",
  homonym: "Plusieurs fiches portent ce nom. La file attend.",
  shown: "Deux séjours déjà montrés correspondent. La file attend.",
  visible: "Ce séjour est déjà Visible. Les cartes du mail attendent une validation.",
} as const;

export type InboxPlan =
  | { action: "attach"; bookingId: string; customerId: string; mergeIds: string[]; proposals: ReunionProposal[] }
  | { action: "propose"; bookingId: string; customerId: string; message: string }
  | { action: "create"; customerId: string }
  | { action: "create_customer"; firstName: string; lastName: string; email: string | null }
  | { action: "hold"; message: string };

function hasCardAndDate(extract: BookingExtract) {
  const card = (extract.items || []).some(
    (item) => countsAsCarnetCard(item.kind) && (item.title || "").trim()
  );
  if (!card) return false;
  if ((extract.start_date || "").trim() || (extract.end_date || "").trim()) return true;
  return (extract.items || []).some((item) => (item.start_at || "").trim() || (item.end_at || "").trim());
}

/**
 * Un mail fournisseur devient un séjour : le dossier du même voyage, ou un dossier caché.
 * Rien n’est montré, rien n’est envoyé, aucun prix de vente n’est inventé.
 */
export function planInboxOrganization(input: {
  extract: BookingExtract;
  fromEmail?: string | null;
  dossiers: TripDossier[];
  suppressions?: SuppressionRow[];
  customerId?: string | null;
  unreadTicket?: boolean;
  pass?: ReunionOptions;
}): InboxPlan {
  const extract = input.extract;
  const refs = [...extractReferences(extract)];
  if ((input.suppressions || []).some((row) => suppressionMatches(row, refs))) {
    return { action: "hold", message: SUPPRESSED_DOSSIER };
  }
  if (extract.document_status === "identity") return { action: "hold", message: INBOX_HOLDS.identity };
  if (extract.document_status === "quote") return { action: "hold", message: INBOX_HOLDS.quote };
  if (isCancellationExtract(extract) || extract.document_status === "cancelled") {
    return { action: "hold", message: INBOX_HOLDS.cancellation };
  }
  if (!hasCardAndDate(extract)) {
    return { action: "hold", message: input.unreadTicket ? INBOX_HOLDS.unread : INBOX_HOLDS.thin };
  }
  const incoming = incomingTrip(extract, input.customerId);
  const reunion = reunionPlan(incoming, input.dossiers, input.pass);
  if (reunion.hold) return { action: "hold", message: reunion.hold };
  if (reunion.keeper?.customerId) {
    if (reunion.keeper.visible) {
      return {
        action: "propose",
        bookingId: reunion.keeper.id,
        customerId: reunion.keeper.customerId,
        message: INBOX_HOLDS.visible,
      };
    }
    return {
      action: "attach",
      bookingId: reunion.keeper.id,
      customerId: reunion.keeper.customerId,
      mergeIds: reunion.mergeIds,
      proposals: reunion.proposals,
    };
  }
  if (input.customerId) return { action: "create", customerId: input.customerId };
  const person = extractPrimaryPerson(extract) || extractPeople(extract).find((row) => row.first_name && row.last_name);
  if (!person?.first_name || !person.last_name) return { action: "hold", message: INBOX_HOLDS.unnamed };
  return {
    action: "create_customer",
    firstName: person.first_name,
    lastName: person.last_name,
    email: clientEmailForAutoCreate(extract.customer_email, input.fromEmail),
  };
}

export type InboxHandlers = {
  ensureCompanions: (customerId: string, people: TripPerson[]) => Promise<void>;
  createCustomer: (input: { firstName: string; lastName: string; email: string | null }) => Promise<string>;
  findCustomerByName: (firstName: string, lastName: string) => Promise<string | "several" | null>;
  persist: (customerId: string, extract: BookingExtract) => Promise<{ id: string }>;
  apply: (bookingId: string, customerId: string, extract: BookingExtract) => Promise<void>;
  merge: (keepId: string, dropId: string) => Promise<{ ok: boolean; message: string | null }>;
  markAttached: (bookingId: string, customerId: string, created: boolean) => Promise<void>;
  hold: (message: string) => Promise<void>;
  /** Séjour déjà Visible : rien n’est écrit sur les cartes. La file garde la proposition. */
  propose?: (bookingId: string, customerId: string, message: string) => Promise<void>;
};

export async function executeInboxPlan(plan: InboxPlan, extract: BookingExtract, handlers: InboxHandlers) {
  if (plan.action === "hold" || plan.action === "propose") {
    if (plan.action === "propose" && handlers.propose) {
      await handlers.propose(plan.bookingId, plan.customerId, plan.message);
    }
    await handlers.hold(plan.message);
    return { attached: false, bookingId: null as string | null };
  }
  const people = (extract.travelers || [])
    .filter((person) => person.first_name && person.last_name)
    .map((person) => ({ first_name: person.first_name || "", last_name: person.last_name || "" }));
  let customerId = "";
  let created = false;
  if (plan.action === "create_customer") {
    const existing = await handlers.findCustomerByName(plan.firstName, plan.lastName);
    if (existing === "several") {
      await handlers.hold(INBOX_HOLDS.homonym);
      return { attached: false, bookingId: null };
    }
    customerId = existing || (await handlers.createCustomer(plan));
  } else {
    customerId = plan.customerId;
  }
  await handlers.ensureCompanions(customerId, people);
  let bookingId = "";
  if (plan.action === "attach") {
    if (plan.proposals.length && handlers.propose) {
      await handlers.propose(plan.proposals[0].id, plan.customerId, DIFFERENT_CLIENT_HOLD);
    }
    for (const dropId of plan.mergeIds) {
      const merged = await handlers.merge(plan.bookingId, dropId);
      if (!merged.ok && merged.message) {
        await handlers.hold(merged.message);
        return { attached: false, bookingId: null };
      }
    }
    await handlers.apply(plan.bookingId, customerId, extract);
    bookingId = plan.bookingId;
  } else {
    const saved = await handlers.persist(customerId, extract);
    bookingId = saved.id;
    created = true;
  }
  await handlers.markAttached(bookingId, customerId, created);
  return { attached: true, bookingId };
}
