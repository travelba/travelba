/** Types CRM pour les guides mTrip (app voyageur). */

export type MtripGuideStatus = "draft" | "ready" | "published" | "error";

export type MtripGuidePassenger = {
  id: string;
  first_name: string;
  last_name: string;
  /** Prénoms complémentaires (MRZ / visa). */
  middle_names?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "lead_traveler" | "traveler";
  language?: string;
  /** Adresse personnelle (voyageur principal). */
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  /** Données document de voyage (billet + visa). */
  passport_number?: string | null;
  nationality?: string | null;
  issuing_country?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  passport_expiry?: string | null;
  passport_issued_date?: string | null;
  sex?: string | null;
  /** Métadonnées import passeport. */
  source_file?: string | null;
  attachment_path?: string | null;
  import_status?: "complete" | "review" | "manual";
  import_warnings?: string[];
};

export type QuoteLine = {
  id: string;
  kind: "flight" | "hotel" | "transfer" | "other";
  /** Ligne principale : nom de l’hôtel / libellé vol */
  title: string;
  confirmation?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  document_id?: string | null;
  source_file?: string | null;
  /** Type de chambre (ex. Two Bedroom Suite) */
  room_type?: string | null;
  /** Détails chambre / occupancy / repas / lit */
  room_details?: string | null;
};

export type PassportFileAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size: number;
  passenger_id?: string | null;
  uploaded_at: string;
};

export type VoyageSendRecord = {
  id: string;
  channel: "twilio" | "cloud_api" | "deep_link" | "email";
  /** Étape du plan WhatsApp : opt-in Concierge, puis dossier voyage. */
  kind?: "optin" | "dossier";
  to: string;
  body_preview: string;
  quote_url?: string | null;
  deep_link?: string | null;
  message_id?: string | null;
  sent_at: string;
};

export type MtripGuideDocument = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size: number;
  kind?: "flight" | "hotel" | "other" | "unknown";
  uploaded_at: string;
};

export type MtripGuideExtraction = {
  flights?: Array<Record<string, unknown>>;
  hotels?: Array<Record<string, unknown>>;
  notes?: string[];
  raw_texts?: Array<{ document_id: string; preview: string }>;
  extracted_at?: string;
};

export type AgencyMtripGuide = {
  id: string;
  user_id: string;
  dossier_id: string | null;
  client_id?: string | null;
  title: string;
  status: MtripGuideStatus;
  mtrip_identifier: string | null;
  mtrip_trip_id: number | null;
  mtrip_account_id: number;
  start_date: string | null;
  end_date: string | null;
  passengers: MtripGuidePassenger[];
  documents: MtripGuideDocument[];
  passport_files?: PassportFileAttachment[];
  quote_lines?: QuoteLine[];
  sends?: VoyageSendRecord[];
  /** Token opaque pour le devis client public `/devis/[token]`. */
  quote_token?: string | null;
  /** Code court WhatsApp : `/d/{code}` dépenses, `/v/{code}` My Trip. */
  short_code?: string | null;
  extraction: MtripGuideExtraction;
  payload: unknown;
  app_links: Record<string, string>;
  last_error: unknown;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Étape borne dérivée de l’état du voyage. */
export type VoyageStep =
  | "passports"
  | "contact"
  | "roles"
  | "bookings"
  | "send"
  | "done";

export const VOYAGE_STEP_LABELS: Record<VoyageStep, string> = {
  passports: "Passeports",
  contact: "Contact",
  roles: "Rôles",
  bookings: "Résas",
  send: "Envoyer",
  done: "Transmis",
};

/** Étapes UI borne (4 écrans). */
export const WIZARD_STEPS = [
  { id: "passports" as const, label: "Passeports", short: "1" },
  { id: "contact" as const, label: "Contact", short: "2" },
  { id: "bookings" as const, label: "Résas", short: "3" },
  { id: "send" as const, label: "Envoi", short: "4" },
];

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export function wizardStepFromGuide(guide: AgencyMtripGuide): WizardStepId {
  const step = deriveVoyageStep(guide);
  if (step === "done" || step === "send") return "send";
  if (step === "bookings" || step === "roles") return "bookings";
  if (step === "contact") return "contact";
  return "passports";
}

export function deriveVoyageStep(guide: AgencyMtripGuide): VoyageStep {
  const pax = guide.passengers || [];
  const lead =
    pax.find((p) => p.role === "lead_traveler") || pax[0] || null;
  const hasPax = pax.length > 0;
  const contactOk = Boolean(lead?.email?.trim() && lead?.phone?.trim());
  const hasBookings =
    (guide.documents || []).length > 0 || (guide.quote_lines || []).length > 0;
  const hasSend = (guide.sends || []).length > 0;
  const published = guide.status === "published";

  if (hasSend) return "done";
  if (published && hasBookings && contactOk) return "send";
  if (hasBookings) return "send";
  if (contactOk) return "bookings";
  if (hasPax) return "contact";
  return "passports";
}

export const MTRIP_GUIDE_STATUS_LABELS: Record<MtripGuideStatus, string> = {
  draft: "Brouillon",
  ready: "Prêt",
  published: "Publié",
  error: "Erreur",
};
