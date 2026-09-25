/**
 * Aperçu local de l’espace client. Données en mémoire uniquement.
 * Ne jamais écrire ce jeu dans Supabase (prod `fsmfozxgujskluxakeoq` comprise).
 */
import { shapeClientLedger } from "./client-ledger";
import { CHECKIN_EUR, CHAUFFEUR_EUR, GREETER_ADULT_EUR, GREETER_CHILD_EUR, VISA_EUR } from "./extras";
import {
  customerFullName,
  type CrmBooking,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmCompanion,
  type CrmCustomer,
  type CrmTransaction,
  type CrmTravelDocument,
} from "./types";

const STAMP = "2026-09-01T12:00:00.000Z";

export const EXAMPLE_BASE = "/exemple";
export const EXAMPLE_REFERENCE = "TB-EXEMPLE-0001";

const CUSTOMER_ID = "exemple-client";
const COMPANION_ID = "exemple-compagnon";
const BOOKING_ID = "exemple-sejour";

/** Fermé sur travelba.fr. Ouvert en local et sur une preview. */
export function exampleSessionEnabled() {
  return process.env.VERCEL_ENV !== "production";
}

function customer(): CrmCustomer {
  return {
    id: CUSTOMER_ID,
    auth_user_id: null,
    first_name: "Camille",
    last_name: "Morel",
    usage_name: null,
    email: "camille.morel@exemple.invalid",
    phone: "+33600000000",
    phone_secondary: null,
    whatsapp: null,
    birth_date: "1984-06-15",
    sex: "F",
    nationality: "FR",
    address_line: "1 place de l'Exemple",
    postal_code: "69002",
    city: "Lyon",
    country: "FR",
    flying_blue: null,
    loyalty: null,
    iban: null,
    company_name: "Atelier Exemple",
    siret: null,
    vat_number: null,
    billing_email: null,
    billing_address_line: "1 place de l'Exemple",
    billing_postal_code: "69002",
    billing_city: "Lyon",
    billing_country: "FR",
    company_role: null,
    billing_parent_id: null,
    language: "fr",
    stripe_customer_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function companion(): CrmCompanion {
  return {
    id: COMPANION_ID,
    customer_id: CUSTOMER_ID,
    first_name: "Inès",
    last_name: "Morel",
    usage_name: null,
    birth_date: "2016-04-02",
    sex: "F",
    nationality: "FR",
    relationship: "enfant",
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function booking(): CrmBooking {
  return {
    id: BOOKING_ID,
    customer_id: CUSTOMER_ID,
    billing_customer_id: CUSTOMER_ID,
    reference: EXAMPLE_REFERENCE,
    title: "New York",
    destination: "New York",
    status: "confirmed",
    start_date: "2026-11-12",
    end_date: "2026-11-14",
    currency: "EUR",
    total_amount: 0,
    include_in_ledger: false,
    cover_image_path: null,
    cover_credit: null,
    notes_client: "Séjour d’exemple publié par l’agence.",
    notes_internal: null,
    visible_to_client: true,
    prices_visible: false,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function item(
  partial: Pick<CrmBookingItem, "id" | "kind" | "title" | "sort_order"> &
    Partial<Pick<CrmBookingItem, "start_at" | "end_at" | "amount" | "supplier" | "details">>
): CrmBookingItem {
  return {
    id: partial.id,
    booking_id: BOOKING_ID,
    kind: partial.kind,
    title: partial.title,
    supplier: partial.supplier ?? null,
    confirmation_ref: null,
    start_at: partial.start_at ?? null,
    end_at: partial.end_at ?? null,
    amount: partial.amount ?? null,
    include_in_ledger: false,
    sort_order: partial.sort_order,
    details: partial.details ?? {},
    visible_to_client: true,
    source_document_id: null,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function items(): CrmBookingItem[] {
  return [
    item({
      id: "exemple-vol-aller",
      kind: "flight",
      title: "CDG → JFK",
      sort_order: 0,
      start_at: "2026-11-12",
      end_at: "2026-11-12",
      details: { from: "CDG", to: "JFK", city_from: "Paris", city_to: "New York" },
    }),
    item({
      id: "exemple-transfert",
      kind: "transfer",
      title: "Transfert",
      sort_order: 1,
      start_at: "2026-11-12",
      details: { pickup: "JFK", dropoff: "Maison Horizon" },
    }),
    item({
      id: "exemple-hotel",
      kind: "hotel",
      title: "Maison Horizon",
      sort_order: 2,
      start_at: "2026-11-12",
      end_at: "2026-11-14",
      details: { hotel_name: "Maison Horizon", city: "New York" },
    }),
    item({
      id: "exemple-voiture",
      kind: "car",
      title: "Voiture",
      sort_order: 3,
      start_at: "2026-11-12",
      end_at: "2026-11-14",
    }),
    item({
      id: "exemple-activite",
      kind: "activity",
      title: "Visite",
      sort_order: 4,
      start_at: "2026-11-13",
      details: { city: "New York" },
    }),
    item({
      id: "exemple-train",
      kind: "rail",
      title: "New York → Washington",
      sort_order: 5,
      start_at: "2026-11-13",
      details: { city_from: "New York", city_to: "Washington" },
    }),
    item({
      id: "exemple-bateau",
      kind: "cruise",
      title: "Bateau",
      sort_order: 6,
      start_at: "2026-11-13",
      details: { city: "New York" },
    }),
    item({
      id: "exemple-vol-retour",
      kind: "flight",
      title: "JFK → CDG",
      sort_order: 7,
      start_at: "2026-11-14",
      end_at: "2026-11-14",
      details: { from: "JFK", to: "CDG", city_from: "New York", city_to: "Paris" },
    }),
    item({
      id: "exemple-assurance",
      kind: "insurance",
      title: "Assurance voyage",
      sort_order: 8,
    }),
  ];
}

function travelers(): CrmBookingTraveler[] {
  return [
    {
      id: "exemple-voyageur-titulaire",
      booking_id: BOOKING_ID,
      companion_id: null,
      is_account_holder: true,
      first_name: "Camille",
      last_name: "Morel",
      created_at: STAMP,
    },
    {
      id: "exemple-voyageur-enfant",
      booking_id: BOOKING_ID,
      companion_id: COMPANION_ID,
      is_account_holder: false,
      first_name: "Inès",
      last_name: "Morel",
      created_at: STAMP,
    },
  ];
}

function passport(
  partial: Pick<CrmTravelDocument, "id" | "companion_id" | "booking_id" | "traveler_id" | "first_name" | "last_name">
): CrmTravelDocument {
  return {
    id: partial.id,
    customer_id: CUSTOMER_ID,
    companion_id: partial.companion_id,
    booking_id: partial.booking_id,
    traveler_id: partial.traveler_id,
    doc_type: "passport",
    number: null,
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2031-06-01",
    first_name: partial.first_name,
    last_name: partial.last_name,
    usage_name: null,
    birth_date: partial.companion_id ? "2016-04-02" : "1984-06-15",
    nationality: "FR",
    sex: "F",
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function documents(): CrmTravelDocument[] {
  return [
    passport({
      id: "exemple-passeport-titulaire",
      companion_id: null,
      booking_id: null,
      traveler_id: null,
      first_name: "Camille",
      last_name: "Morel",
    }),
    passport({
      id: "exemple-passeport-enfant",
      companion_id: COMPANION_ID,
      booking_id: null,
      traveler_id: null,
      first_name: "Inès",
      last_name: "Morel",
    }),
    passport({
      id: "exemple-passeport-sejour-titulaire",
      companion_id: null,
      booking_id: BOOKING_ID,
      traveler_id: "exemple-voyageur-titulaire",
      first_name: "Camille",
      last_name: "Morel",
    }),
    passport({
      id: "exemple-passeport-sejour-enfant",
      companion_id: COMPANION_ID,
      booking_id: BOOKING_ID,
      traveler_id: "exemple-voyageur-enfant",
      first_name: "Inès",
      last_name: "Morel",
    }),
  ];
}

/** Tarifs déjà prévus des extras. Le séjour lui-même n’a pas de prix vendu. */
export function exampleExtraCharges() {
  const passengers = 2;
  return [
    { id: "exemple-tx-chauffeur", label: "Chauffeur", amount: CHAUFFEUR_EUR },
    { id: "exemple-tx-vip", label: "VIP Airport", amount: GREETER_ADULT_EUR + GREETER_CHILD_EUR },
    { id: "exemple-tx-visa", label: "Obtention du visa", amount: passengers * VISA_EUR },
    { id: "exemple-tx-checkin", label: "Enregistrement", amount: passengers * CHECKIN_EUR },
  ] as const;
}

function transactions(): CrmTransaction[] {
  return exampleExtraCharges().map((row) => ({
    id: row.id,
    customer_id: CUSTOMER_ID,
    booking_id: BOOKING_ID,
    direction: "debit" as const,
    kind: "booking" as const,
    amount: row.amount,
    currency: "EUR",
    occurred_on: "2026-09-01",
    label: row.label,
    source: "manual" as const,
    external_id: `exemple:${row.id}`,
    status: "posted" as const,
    created_at: STAMP,
    updated_at: STAMP,
  }));
}

export function exampleSession() {
  const holder = customer();
  const people = travelers();
  const docs = documents();
  return {
    customer: holder,
    name: customerFullName(holder),
    initials: "CM",
    companion: companion(),
    companions: [companion()],
    booking: booking(),
    bookings: [booking()],
    items: items(),
    travelers: people,
    documents: docs,
    holderDocuments: docs.filter((doc) => !doc.companion_id && !doc.booking_id),
  };
}

export function exampleLedgerView() {
  const session = exampleSession();
  const rows = transactions();
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [session.booking.id],
    rows,
    walletBalance: -total,
    currency: "EUR",
    bookings: [session.booking],
    audience: "client",
  });
  return {
    ...view,
    movements: view.movements.map((row) => ({
      ...row,
      carnetHref: row.carnetHref?.replace("/mon-compte", EXAMPLE_BASE) ?? null,
    })),
  };
}
