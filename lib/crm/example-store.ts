/**
 * État de l’aperçu /exemple, dans le processus Node seulement.
 * Aucune écriture Supabase.
 */
import {
  checkinItemPayload,
  extraAgencyStatus,
  extraAmount,
  extraFlightAt,
  extraHeadsFromBooking,
  extraItemPayload,
  extraNoticeOk,
  findCheckinExtra,
  findExtra,
  findVisaExtra,
  isExtraKind,
  isExtraLeg,
  isGreeterMoment,
  isServicePlace,
  itineraryOffers,
  visaItemPayload,
  type ExtraKind,
  type ExtraLeg,
  type GreeterMoment,
  type ServicePlace,
  type ServiceRefusal,
} from "./extras";
import { exampleLedgerView, exampleSession, EXAMPLE_REFERENCE } from "./example-session";
import type { CrmBookingItem, CrmCompanion, CrmTransaction, CrmTravelDocument } from "./types";
import { confirmAllowed, type ClientVisaStep, type EstaAnswers } from "./visa-flow";

const VERSION = 3;

export class ExampleStop extends Error {
  issues: { field: string; message: string }[];
  constructor(message: string, field = "form") {
    super(message);
    this.issues = [{ field, message }];
  }
}

type VisaRequest = { country: string; step: ClientVisaStep; status: string; accepted_at?: string | null };

type Box = ReturnType<typeof exampleSession> & {
  version: number;
  visaRequests: VisaRequest[];
  transactions: CrmTransaction[];
  refusals: ServiceRefusal[];
};

type StoredFile = { mime: string; name: string; bytes: Uint8Array };

const files = new Map<string, StoredFile>();

function fresh(): Box {
  const session = exampleSession();
  return {
    version: VERSION,
    ...session,
    holderDocuments: session.holderDocuments,
    visaRequests: [],
    transactions: [],
    refusals: [],
  };
}

function box(): Box {
  const g = globalThis as { __travelbaExample?: Box };
  if (!g.__travelbaExample || g.__travelbaExample.version !== VERSION) {
    files.clear();
    g.__travelbaExample = fresh();
  }
  return g.__travelbaExample;
}

function publish(state: Box) {
  state.holderDocuments = state.documents.filter((doc) => !doc.companion_id && !doc.booking_id);
  state.companions = state.companions;
  state.bookings = [state.booking];
  state.name = `${state.customer.first_name} ${state.customer.last_name}`.trim();
}

export function resetExampleState() {
  files.clear();
  (globalThis as { __travelbaExample?: Box }).__travelbaExample = fresh();
}

export function readExample() {
  const state = box();
  return {
    ...state,
    ledger: exampleLedgerView(state.transactions),
  };
}

export function readExampleFile(path: string) {
  return files.get(path) || null;
}

function stamp() {
  return new Date().toISOString();
}

function debit(item: CrmBookingItem) {
  const state = box();
  const externalId = `exemple:item:${item.id}`;
  if (state.transactions.some((row) => row.external_id === externalId)) return;
  state.transactions.push({
    id: `exemple-tx-${item.id}`,
    customer_id: state.customer.id,
    booking_id: state.booking.id,
    direction: "debit",
    kind: "booking",
    amount: Number(item.amount),
    currency: "EUR",
    occurred_on: stamp().slice(0, 10),
    label: item.title,
    source: "manual",
    external_id: externalId,
    status: "posted",
    created_at: stamp(),
    updated_at: stamp(),
  });
}

function dropDebit(itemId: string) {
  const state = box();
  state.transactions = state.transactions.filter((row) => row.external_id !== `exemple:item:${itemId}`);
}

export function saveExampleDocument(input: {
  docType: string;
  issuingCountry: string | null;
  expiresOn: string | null;
  firstName: string | null;
  lastName: string | null;
  companionId: string | null;
  fileName: string | null;
  mimeType: string | null;
  bytes: Uint8Array | null;
}) {
  const state = box();
  const id = `exemple-doc-${state.documents.length + 1}`;
  const path = input.bytes ? `exemple/${id}` : null;
  if (path && input.bytes) {
    files.set(path, {
      mime: input.mimeType || "application/octet-stream",
      name: input.fileName || "piece-exemple",
      bytes: input.bytes,
    });
  }
  const doc: CrmTravelDocument = {
    id,
    customer_id: state.customer.id,
    companion_id: input.companionId,
    booking_id: null,
    traveler_id: null,
    doc_type: input.docType === "id_card" ? "id_card" : "passport",
    number: null,
    issuing_country: input.issuingCountry || (input.docType === "passport" ? "FR" : null),
    issued_on: null,
    expires_on: input.expiresOn,
    first_name: input.firstName,
    last_name: input.lastName,
    usage_name: null,
    birth_date: null,
    nationality: "FR",
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: path,
    file_name: input.fileName,
    mime_type: input.mimeType,
    created_at: stamp(),
    updated_at: stamp(),
  };
  state.documents.push(doc);
  publish(state);
  return doc;
}

export function removeExampleDocument(id: string) {
  const state = box();
  const doc = state.documents.find((row) => row.id === id);
  if (doc?.storage_path) files.delete(doc.storage_path);
  state.documents = state.documents.filter((row) => row.id !== id);
  publish(state);
}

export function saveExampleCompanion(input: {
  firstName: string;
  lastName: string;
  usageName: string | null;
  birthDate: string | null;
  sex: string | null;
  nationality: string | null;
  relationship: string | null;
}) {
  const state = box();
  const row: CrmCompanion = {
    id: `exemple-compagnon-${state.companions.length + 1}`,
    customer_id: state.customer.id,
    first_name: input.firstName,
    last_name: input.lastName,
    usage_name: input.usageName,
    birth_date: input.birthDate,
    sex: input.sex,
    nationality: input.nationality,
    relationship: input.relationship,
    created_at: stamp(),
    updated_at: stamp(),
  };
  state.companions.push(row);
  publish(state);
  return row;
}

export function removeExampleCompanion(id: string) {
  const state = box();
  if (id === "exemple-compagnon") return;
  state.companions = state.companions.filter((row) => row.id !== id);
  publish(state);
}

function uploadedFrenchPassport(state: Box) {
  return state.documents.some(
    (doc) => doc.doc_type === "passport" && doc.issuing_country === "FR" && Boolean(doc.storage_path)
  );
}

export function launchExampleVisa(
  country: string,
  answers: Partial<EstaAnswers> | null,
  options?: { confirm?: boolean }
) {
  if (country !== "US" && country !== "IL" && country !== "GB") {
    throw new ExampleStop("Pays non pris en charge.");
  }
  const state = box();
  const existing = state.visaRequests.find((row) => row.country === country);
  if (existing?.accepted_at) return existing;
  if (!options?.confirm) throw new ExampleStop("Confirmez la demande avant de lancer le parcours.");
  const block = confirmAllowed({
    already: [],
    country,
    frenchPassports: uploadedFrenchPassport(state) ? 1 : 0,
    esta: answers,
  });
  if (block) throw new ExampleStop(block);
  const request: VisaRequest = {
    country,
    step: "paiement",
    status: "en_cours",
    accepted_at: new Date().toISOString(),
  };
  if (existing) {
    existing.step = request.step;
    existing.status = request.status;
    existing.accepted_at = request.accepted_at;
  } else {
    state.visaRequests.push(request);
  }
  publish(state);
  return existing || request;
}

type OrderBody = {
  kind?: string;
  leg?: string | null;
  place?: string | null;
  moment?: string | null;
  address?: string | null;
  decline?: boolean;
  cancel?: boolean;
};

export function orderExampleExtra(body: OrderBody) {
  const state = box();
  const kind = String(body.kind || "");
  if (kind !== "visa" && kind !== "checkin" && !isExtraKind(kind)) {
    throw new ExampleStop("Indiquez un service (transfert, VIP Airport, enregistrement ou visa).", "kind");
  }
  const leg = isExtraLeg(String(body.leg || "")) ? (body.leg as ExtraLeg) : null;
  const place = isServicePlace(String(body.place || "")) ? (body.place as ServicePlace) : null;
  const moment = isGreeterMoment(String(body.moment || "")) ? (body.moment as GreeterMoment) : null;

  if (body.decline) {
    state.refusals.push({
      kind: kind as ServiceRefusal["kind"],
      leg: kind === "visa" || kind === "checkin" ? null : leg,
      place: kind === "chauffeur" ? place : null,
      moment: kind === "greeter" ? moment || "depart" : null,
    });
    return { declined: true as const };
  }

  if (body.cancel) {
    const item = findOrdered(state.items, kind, leg, place, moment);
    if (!item) throw new ExampleStop("Ce service n’est pas validé.", "kind");
    if (extraAgencyStatus(item) === "confirmed") {
      throw new ExampleStop("Ce service est confirmé par l’agence et ne peut plus être annulé.", "kind");
    }
    state.items = state.items.filter((row) => row.id !== item.id);
    dropDebit(item.id);
    return { cancelled: true as const };
  }

  if (kind === "chauffeur" || kind === "greeter") {
    if (!leg) throw new ExampleStop("Indiquez un trajet (départ ou arrivée).", "leg");
    if (kind === "chauffeur" && !place) throw new ExampleStop("Indiquez un transfert domicile ou hôtel.", "place");
    if (kind === "chauffeur" && !String(body.address || "").trim()) {
      throw new ExampleStop("Indiquez l’adresse.", "address");
    }
    const offer = itineraryOffers(state.items).find(
      (row) =>
        row.kind === kind &&
        row.leg === leg &&
        (row.place || null) === (kind === "chauffeur" ? place : null) &&
        (row.moment || null) === (kind === "greeter" ? moment || "depart" : null)
    );
    if (!offer) throw new ExampleStop("Ce service ne correspond pas aux vols du dossier.", "leg");
    if (findExtra(state.items, kind as ExtraKind, leg, kind === "chauffeur" ? place : null, kind === "greeter" ? moment || "depart" : null)) {
      throw new ExampleStop("Ce service est déjà validé.", "leg");
    }
    const flightAt = extraFlightAt(state.items, leg, state.booking.start_date || state.booking.end_date);
    if (!extraNoticeOk(flightAt, new Date())) {
      throw new ExampleStop(
        "Ce service se demande au moins 48 h avant le vol. Écrivez-nous sur WhatsApp pour un départ imminent.",
        "leg"
      );
    }
    const heads = extraHeadsFromBooking({
      travelers: state.travelers,
      holder: state.customer,
      companions: state.companions,
      at: new Date(),
    });
    const amount = extraAmount(kind, heads.adults, heads.children);
    const payload = extraItemPayload({
      kind,
      leg,
      place: kind === "chauffeur" ? place : null,
      moment: kind === "greeter" ? moment || "depart" : null,
      startAt: offer.whenIso || flightAt,
      amount,
      address: body.address,
      adults: heads.adults,
      children: heads.children,
      visibleToClient: true,
    });
    const item = pushItem(state, payload);
    if (payload.details.agency_status === "confirmed" || item.confirmation_ref) {
      throw new ExampleStop("Confirmation refusée sur l’aperçu.");
    }
    debit(item);
    return { item };
  }

  if (kind === "checkin") {
    if (findCheckinExtra(state.items)) throw new ExampleStop("L’enregistrement est déjà sur ce dossier.", "kind");
    const payload = checkinItemPayload({
      travelerCount: state.travelers.length,
      visibleToClient: true,
    });
    const item = pushItem(state, payload);
    debit(item);
    return { item };
  }

  if (findVisaExtra(state.items)) throw new ExampleStop("La demande de visa est déjà sur ce dossier.", "kind");
  const payload = visaItemPayload({
    travelerCount: state.travelers.length,
    visibleToClient: true,
  });
  const item = pushItem(state, payload);
  debit(item);
  return { item };
}

function findOrdered(
  items: CrmBookingItem[],
  kind: string,
  leg: ExtraLeg | null,
  place: ServicePlace | null,
  moment: GreeterMoment | null
): CrmBookingItem | null {
  if (kind === "visa") return findVisaExtra(items);
  if (kind === "checkin") return findCheckinExtra(items);
  if (!leg || !isExtraKind(kind)) return null;
  const match = findExtra(
    items,
    kind,
    leg,
    kind === "chauffeur" ? place : null,
    kind === "greeter" ? moment || "depart" : null
  ) as CrmBookingItem | null;
  return match;
}

function pushItem(
  state: Box,
  payload: ReturnType<typeof extraItemPayload> | ReturnType<typeof visaItemPayload> | ReturnType<typeof checkinItemPayload>
): CrmBookingItem {
  const item: CrmBookingItem = {
    id: `exemple-extra-${state.items.length + 1}`,
    booking_id: state.booking.id,
    kind: payload.kind,
    title: payload.title,
    supplier: payload.supplier,
    confirmation_ref: null,
    start_at: payload.start_at,
    end_at: payload.end_at,
    amount: payload.amount,
    include_in_ledger: true,
    sort_order: state.items.length + 1,
    details: { ...payload.details },
    visible_to_client: true,
    source_document_id: null,
    created_at: stamp(),
    updated_at: stamp(),
  };
  state.items.push(item);
  return item;
}

export function patchExampleCustomer(patch: Record<string, unknown>) {
  const state = box();
  const text = (key: string) => (typeof patch[key] === "string" ? patch[key] : undefined);
  const assign = (key: keyof Box["customer"], value: string | null | undefined) => {
    if (value === undefined) return;
    (state.customer as unknown as Record<string, unknown>)[key] = value;
  };
  assign("first_name", text("first_name"));
  assign("last_name", text("last_name"));
  assign("usage_name", text("usage_name"));
  assign("phone", text("phone"));
  assign("phone_secondary", text("phone_secondary"));
  assign("birth_date", text("birth_date"));
  assign("sex", text("sex"));
  assign("nationality", text("nationality"));
  assign("address_line", text("address_line"));
  assign("postal_code", text("postal_code"));
  assign("city", text("city"));
  assign("country", text("country"));
  assign("company_name", text("company_name"));
  assign("billing_email", text("billing_email"));
  assign("billing_address_line", text("billing_address_line"));
  assign("billing_postal_code", text("billing_postal_code"));
  assign("billing_city", text("billing_city"));
  assign("billing_country", text("billing_country"));
  if ("iban" in patch) state.customer.iban = null;
  if ("siret" in patch) state.customer.siret = null;
  if ("vat_number" in patch) state.customer.vat_number = null;
  publish(state);
  return state.customer;
}

export function exampleReferenceOk(reference: string) {
  return reference === EXAMPLE_REFERENCE;
}
