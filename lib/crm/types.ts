export const BOOKING_STATUSES = ["draft", "quoted", "confirmed", "cancelled"] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Kinds que l’import peut produire. La dépense libre n’en fait pas partie. */
export const INGEST_ITEM_KINDS = [
  "flight",
  "hotel",
  "transfer",
  "activity",
  "rail",
  "car",
  "cruise",
  "insurance",
  "fee",
  "chauffeur",
  "greeter",
  "visa",
  "checkin",
] as const;

export const BOOKING_ITEM_KINDS = [...INGEST_ITEM_KINDS, "expense"] as const;

export type BookingItemKind = (typeof BOOKING_ITEM_KINDS)[number];

export const BOOKING_ITEM_LABELS: Record<BookingItemKind, string> = {
  flight: "Vol",
  hotel: "Hôtel",
  transfer: "Transfert",
  activity: "Activité",
  rail: "Train",
  car: "Voiture",
  cruise: "Bateau",
  insurance: "Assurance",
  fee: "Frais",
  chauffeur: "Chauffeur",
  greeter: "VIP Airport",
  visa: "Visa",
  expense: "Dépense",
  checkin: "Enregistrement",
};

/** Cartes hors séjour (total + publication). */
export const EXTRA_ITEM_KINDS = ["chauffeur", "greeter", "visa", "checkin"] as const;

export function isExtraItemKind(kind: string | null | undefined) {
  return kind === "chauffeur" || kind === "greeter" || kind === "visa" || kind === "checkin";
}

/** Libellé visible. La clé `greeter` et les textes déjà en base restent inchangés. */
export function visibleServiceCopy(text: string) {
  return text.replace(/\bgreeter\b/gi, "VIP Airport");
}

/** Dépense libre : au grand livre, absente de l’itinéraire. */
export function isLedgerExpenseKind(kind: string | null | undefined): kind is "expense" {
  return kind === "expense";
}

/** Carte métier exigée pour publier le carnet. */
export function countsAsCarnetCard(kind: string | null | undefined) {
  return Boolean(kind) && kind !== "fee" && !isLedgerExpenseKind(kind) && !isExtraItemKind(kind);
}

export const ITEM_LIFECYCLES = ["active", "superseded", "cancelled"] as const;

export type ItemLifecycle = (typeof ITEM_LIFECYCLES)[number];

/** Une carte sans cycle, ou active, compose le séjour. Remplacée ou annulée : hors total et hors carnet. */
export function isActiveItem(item: { lifecycle?: string | null }) {
  return item.lifecycle !== "superseded" && item.lifecycle !== "cancelled";
}

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

/** Espace agence : uniquement les virements reçus (pas les débits résa / frais). */
export function isCreditTransfer(row: { direction: string; kind: string }) {
  return row.direction === "credit" && row.kind === "transfer";
}

export function filterCreditTransfers<T extends { direction: string; kind: string }>(
  rows: T[]
) {
  return rows.filter(isCreditTransfer);
}

/** Encaissements agence : virement Revolut, règlement Stripe (carte ou prélèvement), saisie manuelle. */
const AGENCY_RECEIPT_KINDS = new Set(["transfer", "card_payment"]);

export function isAgencyReceipt(row: { direction: string; kind: string }) {
  return row.direction === "credit" && AGENCY_RECEIPT_KINDS.has(row.kind);
}

export function filterAgencyReceipts<T extends { direction: string; kind: string }>(rows: T[]) {
  return rows.filter(isAgencyReceipt);
}

/** Libellé ledger de la commission 10 % sur les étapes et les dépenses de la réservation. */
export const AGENCY_FEE_LABEL = "Frais d’agence 10 %";

export type CrmStaff = {
  id: string;
  auth_user_id: string;
  role: "admin" | "agent";
  full_name: string;
  created_at: string;
  updated_at: string;
};

export type CompanyRole = "admin" | "member";

export type CrmCustomer = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  usage_name?: string | null;
  email: string;
  phone: string | null;
  phone_secondary: string | null;
  whatsapp: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  flying_blue: string | null;
  loyalty: Record<string, string | null> | null;
  iban: string | null;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  /** null = particulier ; admin = voit revenus société ; member = frais de ses voyages seulement */
  company_role: CompanyRole | null;
  /** Pour member : wallet / admin société qui paie */
  billing_parent_id: string | null;
  /** Droit de dépense en euros sur le wallet société. Null = pas de plafond personnel. */
  spending_allowance?: number | null;
  language: string;
  stripe_customer_id: string | null;
  /** Badge / filtre admin — aucun effet côté espace client. */
  on_hold?: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmCompanion = {
  id: string;
  customer_id: string;
  first_name: string;
  last_name: string;
  usage_name?: string | null;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  relationship: string | null;
  /** E.164. Absent : le lien du voyage reste copiable, WhatsApp ne part pas. */
  phone?: string | null;
  /** Numéros de programmes (Flying Blue, Grand Voyageur, Great Members, …). */
  loyalty?: Record<string, string | null> | null;
  created_at: string;
  updated_at: string;
};

export type CrmTravelDocument = {
  id: string;
  customer_id: string;
  companion_id: string | null;
  booking_id: string | null;
  traveler_id: string | null;
  doc_type: TravelDocType;
  number: string | null;
  issuing_country: string | null;
  issued_on: string | null;
  expires_on: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  birth_date: string | null;
  nationality: string | null;
  sex: string | null;
  place_of_birth: string | null;
  authority: string | null;
  personal_number: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmBooking = {
  id: string;
  customer_id: string;
  /** Wallet facturé (admin société ou titulaire). */
  billing_customer_id: string;
  /** Société de facturation du séjour. Le solde reste unique ; elle sert à la répartition. */
  billing_company_id?: string | null;
  /** company = société du compte ; personal = particulier. */
  payer_kind?: "company" | "personal" | null;
  /** false : frais d’agence et dépenses portent l’autre mention que le séjour. */
  fees_follow_stay?: boolean;
  /** True : l’agence a rangé les cartes autrement que par les dates. */
  items_order_custom?: boolean;
  reference: string;
  title: string;
  destination: string | null;
  status: BookingStatus;
  start_date: string | null;
  end_date: string | null;
  currency: string;
  total_amount: number;
  /** Si false : montant du séjour affiché au carnet, pas au grand livre. */
  include_in_ledger: boolean;
  /** Si true : 10 % des étapes et des dépenses, en une ligne du dossier. */
  agency_commission?: boolean;
  /** `ticketing_off` : la billeterie automatique ne se recrée pas après un retrait. */
  fee_mode?: string | null;
  /** Si true : le client règle le séjour sur sa carte. Le montant sort du grand livre. */
  client_settles_stay?: boolean;
  cover_image_path: string | null;
  /** Mention affichée avec une couverture CC BY. */
  cover_credit: string | null;
  notes_client: string | null;
  notes_internal: string | null;
  visible_to_client: boolean;
  /** False : le carnet est ouvert, les prix du séjour restent masqués. */
  prices_visible?: boolean;
  /** True : le chauffeur est proposé dans cette réservation. Défaut : non. */
  offer_chauffeur?: boolean;
  /** True : le VIP Airport est proposé dans cette réservation. Défaut : non. */
  offer_greeter?: boolean;
  /** True : l’enregistrement est proposé dans cette réservation. Défaut : non. */
  offer_checkin?: boolean;
  /** True : le visa est proposé dans cette réservation. Défaut : non. */
  offer_visa?: boolean;
  /** Suppression agence : le dossier est archivé. Null = actif. */
  archived_at?: string | null;
  /** Visibilité client mémorisée pour la réactivation. */
  archived_was_visible?: boolean | null;
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
  /** Si true : ce prix vendu apparaît dans Transactions et l’encours. */
  include_in_ledger: boolean;
  /** Société de facturation de la dépense, si elle diffère du séjour. */
  billing_company_id?: string | null;
  sort_order: number;
  details: Record<string, unknown>;
  visible_to_client: boolean;
  source_document_id: string | null;
  /** active, ou archivée (remplacée / annulée). Absent = active. */
  lifecycle?: ItemLifecycle | null;
  /** Carte qui a pris la suite, quand lifecycle = superseded. */
  superseded_by?: string | null;
  created_at: string;
  updated_at: string;
};

export const HOTEL_ARRIVAL_STATUSES = [
  "pending",
  "link_requested",
  "link_received",
  "paying",
  "paid",
  "vip_sent",
  "blocked",
  "closed",
] as const;

export type HotelArrivalStatus = (typeof HOTEL_ARRIVAL_STATUSES)[number];

export type HotelArrivalChannel = "little_emperors" | "direct" | "expedia";

export type CardViewLine = {
  itemId: string;
  source: "pliant" | "client";
  name: string;
  at: string;
};

/** Suivi d'arrivée. Le PAN reste chez Pliant. La photo client est un chemin privé, pas un numéro. */
export type CrmHotelArrival = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  channel: HotelArrivalChannel;
  status: HotelArrivalStatus;
  net_cents: number | null;
  amount_cents: number | null;
  currency: string;
  pliant_card_id: string | null;
  /** Quatre derniers chiffres seulement. Jamais le PAN. */
  card_last4: string | null;
  /** Chemin privé agency-cards/. Jamais une URL signée, jamais un PAN. */
  client_card_path?: string | null;
  client_card_name?: string | null;
  card_limit_cents: number | null;
  payment_url: string | null;
  requested_at: string | null;
  relance_count: number;
  last_relance_at: string | null;
  paid_at: string | null;
  vip_sent_at: string | null;
  card_closed_at: string | null;
  blocked_reason: string | null;
  task_open: boolean;
  task_note: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmBookingCard = {
  id: string;
  booking_id: string;
  pliant_card_id: string;
  label: string;
  first_name: string;
  last_name: string;
  limit_cents: number;
  transaction_limit_cents: number | null;
  max_transaction_count: number | null;
  currency: string;
  valid_from: string;
  valid_to: string;
  last4: string | null;
  status: "active" | "locked" | "terminated";
  created_at: string;
};

export const HOTEL_DESK_KINDS = [
  "payment_link",
  "upgrade",
  "precheckin",
  "full_credit",
  "transfer",
  "concierge",
] as const;

export type HotelDeskKind = (typeof HOTEL_DESK_KINDS)[number];

export const HOTEL_DESK_STATUSES = [
  "waiting",
  "due",
  "draft",
  "sent",
  "follow_up",
  "replied",
  "skipped",
] as const;

export type HotelDeskStatus = (typeof HOTEL_DESK_STATUSES)[number];

/** Courrier hôtel préparé pour l'agence. Aucun numéro de carte. */
export type CrmHotelRequest = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  kind: HotelDeskKind;
  status: HotelDeskStatus;
  recipients: string[];
  subject: string;
  body: string;
  edited: boolean;
  card_choice: "pliant" | "client" | null;
  attach_passports: boolean;
  /** Pièces cochées. Vide tant que l'agence n'a pas choisi. */
  identity_document_ids?: string[];
  identity_picked?: boolean;
  due_on: string | null;
  sent_at: string | null;
  follow_up_count: number;
  last_follow_up_at: string | null;
  replied_at: string | null;
  reply_from: string;
  reply_subject: string;
  reply_body: string;
  reply_message_id: string | null;
  /** Titres réellement partis. La recherche suit cette liste. */
  sent_subjects?: string[];
  thread_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Message libre à l'hôtel. Le fil de la fiche le montre avec les courriers. Aucun numéro de carte. */
export type CrmHotelMessage = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  subject: string;
  body: string;
  recipients: string[];
  sent_at: string | null;
  reply_from: string;
  reply_subject: string;
  reply_body: string;
  reply_message_id: string | null;
  replied_at: string | null;
  sent_subjects?: string[];
  thread_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Un tour du fil hôtel. Le texte est déjà nettoyé, sans numéro de carte. */
export type CrmHotelThreadMessage = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  subject_key: string;
  direction: "out" | "in";
  from_email: string;
  subject: string;
  body: string;
  link: string | null;
  received_at: string;
  counts_as_reply: boolean;
  source: "crm" | "gmail";
  request_id: string | null;
  message_id: string | null;
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
  booking_item_id?: string | null;
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
  source: "manual" | "revolut" | "stripe" | "pliant";
  external_id: string | null;
  status: "pending" | "posted" | "void";
  /** Société de la ligne. Le solde reste unique ; elle range la part société. */
  billing_company_id?: string | null;
  /** Société ou particulier, quand le règlement n’est pas lié à un seul dossier. */
  payer_kind?: "company" | "personal" | null;
  created_at: string;
  updated_at: string;
};

export type CrmBillingCompany = {
  id: string;
  customer_id: string;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  sort_order: number;
  /** advance = crédit d’avance. pro = réglé par carte ou Apple Pay. null = encours unique. */
  funding?: "advance" | "pro" | null;
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

export type CrmPliantTransaction = {
  id: string;
  pliant_transaction_id: string;
  card_id: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  booked_at: string | null;
  card_label: string | null;
  card_last4: string | null;
  holder_name: string | null;
  category: string | null;
  comment: string | null;
  match_status: "unmatched" | "matched" | "ignored";
  matched_customer_id: string | null;
  matched_transaction_id: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CrmStripeTransaction = {
  id: string;
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  payer_name: string | null;
  payer_email: string | null;
  reference: string | null;
  method: "card" | "apple_pay" | "sepa" | "other" | null;
  last4: string | null;
  booked_at: string | null;
  raw: Record<string, unknown>;
  matched_customer_id: string | null;
  matched_transaction_id: string | null;
  status: "unmatched" | "matched" | "ignored";
  created_at: string;
  updated_at: string;
};

export type CrmRevolutTransaction = {
  id: string;
  revolut_transaction_id: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
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

export const EMAIL_INGEST_STATUSES = [
  "received",
  "parsed",
  "matched",
  "attached",
  "refused",
  "error",
] as const;

/** File /admin/emails : tout ce qui n’a pas encore été traité par l’agence. */
export const EMAIL_INBOX_QUEUE_STATUSES = [
  "received",
  "parsed",
  "matched",
  "error",
] as const;

export type EmailIngestStatus = (typeof EMAIL_INGEST_STATUSES)[number];

/** Une proposition de rattachement (client ou voyage) pour un e-mail ingéré. */
export type EmailIngestCandidate = {
  customer_id: string;
  booking_id?: string | null;
  label: string;
  reason: string;
  score: number;
};

export type LeBookingLinkStatus = "unmatched" | "linked" | "ignored";

/** Réservation lue sur l’API de test Little Emperors. Pas de téléphone ni d’e-mail d’hôtel. */
export type CrmLeBooking = {
  id: string;
  le_booking_id: number;
  confirmation_number: string | null;
  state: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  check_in: string | null;
  check_out: string | null;
  currency: string | null;
  total_cost: string | null;
  is_cancellable: boolean | null;
  cancellation_deadline: string | null;
  guest_names: string[];
  cancellation_policies: string[];
  room_types: string[];
  crm_booking_id: string | null;
  status: LeBookingLinkStatus;
  candidates: EmailIngestCandidate[];
  last_event: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailIngestAttachment = {
  name: string;
  path: string;
  mime_type: string | null;
};

/** Mail fournisseur (label Gmail) analysé, en attente de rattachement agence. */
export type CrmEmailIngest = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  label: string | null;
  from_email: string | null;
  subject: string | null;
  received_at: string | null;
  body_text: string | null;
  body_html: string | null;
  status: EmailIngestStatus;
  extract: Record<string, unknown> | null;
  candidates: EmailIngestCandidate[];
  attachments: EmailIngestAttachment[];
  warnings: { file: string; message: string }[];
  suggested_customer_id: string | null;
  suggested_booking_id: string | null;
  created_booking_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmCustomerLogin = {
  id: string;
  customer_id: string;
  auth_user_id: string | null;
  method: string;
  created_at: string;
};

export type CrmCustomerActivity = {
  id: string;
  customer_id: string;
  auth_user_id: string | null;
  action: string;
  summary: string;
  detail: string | null;
  path: string | null;
  booking_id: string | null;
  created_at: string;
};

export function customerFullName(c: Pick<CrmCustomer, "first_name" | "last_name">) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client";
}
