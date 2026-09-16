export const BOOKING_STATUSES = [
  "draft",
  "quoted",
  "confirmed",
  "travelling",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: "Brouillon",
  quoted: "Devis",
  confirmed: "Confirmée",
  travelling: "En voyage",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const BOOKING_ITEM_KINDS = [
  "flight",
  "hotel",
  "transfer",
  "activity",
  "insurance",
  "fee",
] as const;

export type BookingItemKind = (typeof BOOKING_ITEM_KINDS)[number];

export const BOOKING_ITEM_LABELS: Record<BookingItemKind, string> = {
  flight: "Vol",
  hotel: "Hôtel",
  transfer: "Transfert",
  activity: "Activité",
  insurance: "Assurance",
  fee: "Frais",
};

export const DOC_TYPES = [
  "passport",
  "id_card",
  "visa",
  "insurance",
  "other",
] as const;

export type TravelDocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<TravelDocType, string> = {
  passport: "Passeport",
  id_card: "Carte d'identité",
  visa: "Visa",
  insurance: "Assurance",
  other: "Autre",
};

export const TX_KINDS = [
  "booking",
  "transfer",
  "refund",
  "adjustment",
  "card_payment",
] as const;

export type TransactionKind = (typeof TX_KINDS)[number];

export const TX_KIND_LABELS: Record<TransactionKind, string> = {
  booking: "Réservation",
  transfer: "Virement",
  refund: "Remboursement",
  adjustment: "Ajustement",
  card_payment: "Carte",
};

export type CrmStaff = {
  id: string;
  auth_user_id: string;
  role: "admin" | "agent";
  full_name: string;
  created_at: string;
  updated_at: string;
};

export type CrmCustomer = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  language: string;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmCompanion = {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  relationship: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmTravelDocument = {
  id: string;
  customer_id: string;
  companion_id: string | null;
  doc_type: TravelDocType;
  number: string | null;
  issuing_country: string | null;
  issued_on: string | null;
  expires_on: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmBooking = {
  id: string;
  customer_id: string;
  reference: string;
  title: string;
  destination: string | null;
  status: BookingStatus;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  total_amount: number;
  cover_image_path: string | null;
  notes_client: string | null;
  notes_internal: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmBookingItem = {
  id: string;
  booking_id: string;
  kind: BookingItemKind;
  title: string;
  supplier: string | null;
  confirmation_ref: string | null;
  start_at: string | null;
  end_at: string | null;
  amount: number | null;
  sort_order: number;
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CrmBookingTraveler = {
  id: string;
  booking_id: string;
  companion_id: string | null;
  is_account_holder: boolean;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
};

export type CrmBookingDocument = {
  id: string;
  booking_id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string;
  visible_to_client: boolean;
  created_at: string;
};

export type CrmTransaction = {
  id: string;
  customer_id: string;
  booking_id: string | null;
  direction: "debit" | "credit";
  kind: TransactionKind;
  amount: number;
  currency: string;
  occurred_on: string;
  label: string;
  source: "manual" | "revolut" | "stripe";
  external_id: string | null;
  status: "pending" | "posted" | "void";
  created_at: string;
  updated_at: string;
};

export type CrmPaymentMethod = {
  id: string;
  customer_id: string;
  stripe_payment_method_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
};

export type CrmRevolutTransaction = {
  id: string;
  revolut_transaction_id: string;
  amount: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  reference: string | null;
  booked_at: string | null;
  raw: Record<string, unknown>;
  matched_customer_id: string | null;
  matched_transaction_id: string | null;
  status: "unmatched" | "matched" | "ignored";
  created_at: string;
  updated_at: string;
};

export type CrmBalance = {
  customer_id: string;
  currency: string;
  balance: number;
};

export function customerFullName(c: Pick<CrmCustomer, "first_name" | "last_name">) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client";
}
