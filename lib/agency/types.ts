export const DOSSIER_STATUSES = [
  "draft",
  "quote_hotels_sent",
  "hotel_selected",
  "quote_rooms_sent",
  "client_approved",
  "booked",
  "payment_pending",
  "paid",
  "cancelled",
] as const;

export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
  draft: "Brouillon",
  quote_hotels_sent: "Devis hôtels envoyé",
  hotel_selected: "Hôtel choisi",
  quote_rooms_sent: "Devis chambres envoyé",
  client_approved: "Client validé",
  booked: "Réservé",
  payment_pending: "Paiement en attente",
  paid: "Payé",
  cancelled: "Annulé",
};

export type AgencyRoomOccupancy = {
  adults: number;
  children?: Array<{ age: number }> | null;
};

export type AgencyClient = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  passport_number?: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyDossier = {
  id: string;
  user_id: string;
  client_id: string | null;
  title: string | null;
  status: DossierStatus;
  destination_text: string | null;
  location_id: number | null;
  location_type: "hotel" | "location" | "inspiration" | null;
  hotel_id: number | null;
  hotel_name: string | null;
  start_date: string;
  end_date: string;
  currency: string;
  rooms: AgencyRoomOccupancy[];
  selected_rate_index: string | null;
  session_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  agency_clients?: AgencyClient | null;
};

export type AgencyDossierHotel = {
  id: string;
  dossier_id: string;
  user_id: string;
  le_hotel_id: number;
  hotel_name: string;
  location: string | null;
  image_url: string | null;
  lowest_rate: number | null;
  currency_code: string | null;
  is_available: boolean;
  is_selected: boolean;
  snapshot: unknown;
  created_at: string;
};

export type AgencyQuote = {
  id: string;
  dossier_id: string;
  user_id: string;
  quote_type: "hotels" | "rooms";
  storage_path: string | null;
  public_url: string | null;
  payload: unknown;
  sent_at: string | null;
  created_at: string;
};

export type AgencyBooking = {
  id: string;
  dossier_id: string;
  user_id: string;
  le_booking_id: number | null;
  confirmation_number: string | null;
  hotel_id: number | null;
  hotel_name: string | null;
  check_in: string | null;
  check_out: string | null;
  total_cost: string | null;
  currency: string | null;
  state: string | null;
  guest_name: string | null;
  guest_email: string | null;
  session_id: string | null;
  rate_index: string | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
};

export type AgencyHotelContact = {
  id: string;
  user_id: string;
  le_hotel_id: number;
  hotel_name: string | null;
  emails: string[];
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyPaymentFollowup = {
  id: string;
  dossier_id: string;
  booking_id: string | null;
  user_id: string;
  status:
    | "draft"
    | "sent"
    | "awaiting_link"
    | "link_received"
    | "paid"
    | "cancelled";
  to_emails: string[];
  subject: string | null;
  body: string | null;
  payment_link: string | null;
  resend_id: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type {
  AgencyMtripGuide,
  MtripGuideDocument,
  MtripGuidePassenger,
  MtripGuideStatus,
} from "@/lib/mtrip/guide-types";
export { MTRIP_GUIDE_STATUS_LABELS } from "@/lib/mtrip/guide-types";

export function formatMoney(
  amount: number | null | undefined,
  currency = "EUR"
) {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
