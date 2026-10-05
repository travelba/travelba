import { z } from "zod";
import { parseMoney } from "./money";
import { stayCurrency } from "./stay-currency";
import { BOOKING_STATUSES } from "./types";

/** Corps JSON des routes agence : validation avant toute requête, premier message lisible en français. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function blankToUndefined(value: unknown) {
  if (value == null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  return value;
}

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

const uuidSchema = (label: string) => z.uuid({ error: `${label} invalide.` });

/** uuid, ou absent (« », null, undefined). */
const optionalUuid = (label: string) =>
  z.preprocess(blankToUndefined, uuidSchema(label).optional());

/** « 2026-10-04 » ou absent (« », null). */
const optionalIsoDate = (label: string) =>
  z.preprocess(
    (value) => blankToUndefined(trimmed(value)),
    z
      .string({ error: `${label} invalide (AAAA-MM-JJ).` })
      .refine(isIsoDate, { error: `${label} invalide (AAAA-MM-JJ).` })
      .optional()
  );

const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => (value == null ? undefined : value),
    z.string({ error: `${label} invalide.` }).max(max, { error: `${label} : ${max} caractères maximum.` }).optional()
  );

/** Cases du formulaire : booléen ou « on » / « off » / « true » / « false ». */
const boolish = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .union([z.boolean(), z.enum(["on", "off", "true", "false"])], { error: `${label} : vrai ou faux attendu.` })
      .optional()
  );

const bookingStatus = z.preprocess(
  blankToUndefined,
  z.enum(BOOKING_STATUSES, { error: "Statut de dossier inconnu." }).optional()
);

/** Devise du séjour normalisée (EUR, USD, CHF, GBP ; hors liste → EUR). */
const currency = z.preprocess(blankToUndefined, z.unknown().optional()).transform((value) => stayCurrency(value));

export const createBookingSchema = z.object({
  customer_id: z.preprocess(trimmed, uuidSchema("Client")),
  title: z.preprocess(trimmed, z.string({ error: "Titre invalide." }).min(1, { error: "Le titre du voyage est obligatoire." })),
  destination: optionalText("Destination", 200),
  status: bookingStatus,
  start_date: optionalIsoDate("Date de départ"),
  end_date: optionalIsoDate("Date de retour"),
  currency,
  billing_customer_id: optionalUuid("Payeur"),
  billing_company_id: optionalUuid("Société"),
  payer_kind: z.preprocess(
    blankToUndefined,
    z.enum(["company", "personal"], { error: "Règlement : société ou particulier." }).optional()
  ),
  fees_follow_stay: boolish("Frais suivant le séjour"),
  include_in_ledger: boolish("Inclure dans les transactions"),
  agency_commission: boolish("Frais d’agence"),
  client_settles_stay: boolish("Le client règle ce séjour"),
  notes_client: optionalText("Notes client", 5000),
  notes_internal: optionalText("Notes internes", 5000),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Montant saisi à la française (« 1 200,50 ») ou nombre ; doit dépasser zéro. */
const positiveMoney = z.preprocess(
  (value) => (typeof value === "string" || typeof value === "number" ? parseMoney(value) : value),
  z
    .number({ error: "Indiquez un montant." })
    .positive({ error: "Indiquez un montant supérieur à zéro." })
);

export const createTransactionSchema = z.object({
  customer_id: z.preprocess(
    (value) => blankToUndefined(trimmed(value)),
    z.string({ error: "Choisissez un client." }).pipe(uuidSchema("Client"))
  ),
  booking_id: z.preprocess(blankToUndefined, uuidSchema("Dossier").nullable().optional()),
  amount: positiveMoney,
  currency: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value) || undefined,
    z
      .string({ error: "Devise invalide (3 lettres)." })
      .regex(/^[A-Z]{3}$/, { error: "Devise invalide (3 lettres)." })
      .default("EUR")
  ),
  occurred_on: optionalIsoDate("Date du virement"),
  label: z.preprocess(
    trimmed,
    z.string({ error: "Libellé invalide." }).max(200, { error: "Libellé : 200 caractères maximum." }).optional()
  ),
  kind: optionalText("Type", 40),
  direction: optionalText("Sens", 10),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

const companyText = (label: string) =>
  z.preprocess(
    (value) => (value === undefined ? undefined : value),
    z.string({ error: `${label} invalide.` }).max(300, { error: `${label} : 300 caractères maximum.` }).nullable().optional()
  );

/** Société de facturation telle que l’envoie le formulaire ; les clés inconnues sont ignorées. */
export const billingCompanyInputSchema = z.object({
  id: z.preprocess(blankToUndefined, uuidSchema("Société").nullable().optional()),
  company_name: companyText("Raison sociale"),
  siret: companyText("SIRET"),
  vat_number: companyText("TVA"),
  billing_email: companyText("E-mail de facturation"),
  billing_address_line: companyText("Adresse de facturation"),
  billing_postal_code: companyText("Code postal de facturation"),
  billing_city: companyText("Ville de facturation"),
  billing_country: companyText("Pays de facturation"),
});

/** Champs du PATCH client hors `customerPatchFromBody`. Le reste du corps passe tel quel. */
export const patchCustomerSchema = z.object({
  on_hold: z.boolean({ error: "« Compte en veille » : vrai ou faux attendu." }).optional(),
  billing_companies: z
    .array(billingCompanyInputSchema, { error: "Liste de sociétés invalide." })
    .max(20, { error: "20 sociétés maximum." })
    .optional(),
});

export type PatchCustomerInput = z.infer<typeof patchCustomerSchema>;

function fieldLabel(path: PropertyKey[]) {
  return path.map(String).filter(Boolean).join(".");
}

/** Premier message lisible : le message métier s’il existe, sinon le champ en cause. */
export function schemaErrorMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Requête invalide.";
  const message = issue.message || "";
  if (message && !/^(Invalid|Too|Unrecognized|Expected|Required)/i.test(message)) return message;
  const field = fieldLabel(issue.path);
  return field ? `Champ « ${field} » invalide.` : "Requête invalide.";
}

/** Valide un corps JSON ; renvoie les données typées (`error: null`) ou le premier message d’erreur. */
export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): { data: T; error: null } | { data: null; error: string } {
  const result = schema.safeParse(body && typeof body === "object" ? body : {});
  if (result.success) return { data: result.data, error: null };
  return { data: null, error: schemaErrorMessage(result.error) };
}
