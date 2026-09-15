import { z } from "zod";

/** Champs requis pour réservation aérienne / demande visa (IATA + MRZ). */
export const TRAVEL_DOCUMENT_FIELDS = [
  "first_name",
  "last_name",
  "passport_number",
  "nationality",
  "birth_date",
  "sex",
  "passport_expiry",
] as const;

export type TravelDocumentField = (typeof TRAVEL_DOCUMENT_FIELDS)[number];

export const passengerSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  middle_names: z.string().nullable().optional(),
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
  phone: z
    .union([z.string(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v)),
  role: z.enum(["lead_traveler", "traveler"]).optional(),
  language: z.string().optional(),
  address_line: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  issuing_country: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  birth_place: z.string().nullable().optional(),
  passport_expiry: z.string().nullable().optional(),
  passport_issued_date: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  source_file: z.string().nullable().optional(),
  attachment_path: z.string().nullable().optional(),
  import_status: z.enum(["complete", "review", "manual"]).optional(),
  import_warnings: z.array(z.string()).optional(),
});

export type PassengerSchema = z.infer<typeof passengerSchema>;

export function normalizeSex(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "M" || v === "MALE" || v === "HOMME" || v === "H") return "M";
  if (v === "F" || v === "FEMALE" || v === "FEMME") return "F";
  if (v === "X" || v === "U") return "X";
  return v.slice(0, 1);
}

export function normalizeIso3(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(v)) return v;
  return null;
}

const NATIONALITY_ALIASES: Record<string, string> = {
  FRANCAISE: "FRA",
  FRANÇAISE: "FRA",
  FRANCE: "FRA",
  FRENCH: "FRA",
  ITALIANA: "ITA",
  ITALIENNE: "ITA",
  ITALIAN: "ITA",
  ITALIE: "ITA",
  ITALY: "ITA",
  ESPAGNOLE: "ESP",
  SPANISH: "ESP",
  ESPAGNE: "ESP",
  SPAIN: "ESP",
  ALLEMANDE: "DEU",
  GERMAN: "DEU",
  GERMANY: "DEU",
  BRITISH: "GBR",
  BRITANNIQUE: "GBR",
  ROYAUMEUNI: "GBR",
  AMERICAIN: "USA",
  AMERICAN: "USA",
  AMERICANNE: "USA",
  MAROCAINE: "MAR",
  MOROCCAN: "MAR",
  SUISSE: "CHE",
  SWISS: "CHE",
};

/** Convertit libellé nationalité (zone visuelle) → ISO3. */
export function normalizeNationality(value?: string | null): string | null {
  if (!value) return null;
  const iso = normalizeIso3(value);
  if (iso) return iso;
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return NATIONALITY_ALIASES[key] || null;
}

export function parseVisualDate(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim();

  // JJ MM AAAA or JJ/MM/AAAA
  let m = raw.match(/(\d{1,2})[./\-\s]+(\d{1,2})[./\-\s]+(\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yy = Number(m[3]);
    if (m[3].length === 2) yy = yy >= 50 ? 1900 + yy : 2000 + yy;
    if (yy < 1900 || yy > 2100) return null;
    return `${yy}-${mm}-${dd}`;
  }

  // JJMMAAAA collé (ex. 09022035, 22121986)
  m = raw.match(/\b(\d{2})(\d{2})(\d{4})\b/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yy = Number(m[3]);
    if (yy >= 1900 && yy <= 2100 && Number(mm) >= 1 && Number(mm) <= 12) {
      return `${yy}-${mm}-${dd}`;
    }
  }

  return null;
}

export function passengerCompleteness(p: {
  first_name?: string | null;
  last_name?: string | null;
  passport_number?: string | null;
  nationality?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  passport_expiry?: string | null;
}) {
  const missing: TravelDocumentField[] = [];
  for (const field of TRAVEL_DOCUMENT_FIELDS) {
    const val = p[field];
    if (!val || !String(val).trim()) missing.push(field);
  }
  const score = TRAVEL_DOCUMENT_FIELDS.length - missing.length;
  return {
    missing,
    score,
    complete: missing.length === 0,
    label:
      missing.length === 0
        ? "Complet"
        : missing.length <= 2
          ? "À vérifier"
          : "Incomplet",
  };
}

export const FIELD_LABELS: Record<string, string> = {
  first_name: "Prénom",
  last_name: "Nom",
  middle_names: "Autres prénoms",
  passport_number: "N° passeport",
  nationality: "Nationalité (ISO3)",
  issuing_country: "Pays émetteur",
  birth_date: "Date de naissance",
  birth_place: "Lieu de naissance",
  sex: "Sexe",
  passport_expiry: "Expiration passeport",
  passport_issued_date: "Date de délivrance",
  email: "Email",
  phone: "Téléphone",
};
