import "server-only";
import { generateText, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { extractImages, extractText, getDocumentProxy } from "unpdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { nextBookingReference, syncBookingDebit } from "@/lib/crm/bookings";
import { trySharp } from "@/lib/crm/sharp";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { emptyToNull } from "@/lib/crm/identity";
import {
  bookingExtractSchema,
  aiGatewayConfigured,
  openaiApiKey,
  type BookingExtract,
} from "@/lib/crm/ingest-types";
import { scheduleBookingCover } from "@/lib/crm/cover-generate";
import {
  BOOKING_ITEM_KINDS,
  type BookingItemKind,
  type BookingStatus,
  type CrmBooking,
  type CrmCompanion,
  type CrmCustomer,
} from "@/lib/crm/types";

export { bookingExtractSchema, aiGatewayConfigured, type BookingExtract };

export const MAX_INGEST_BYTES = 10 * 1024 * 1024;
export const MAX_INGEST_FILES = 8;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const PROMPT = `Tu es l’assistant d’une agence de voyage française (Travelba).
Lis TOUS les documents fournis (e-tickets IATA/Amadeus, devis Little Emperors / My Concierge, vouchers hôtel, transferts TAAP/Talixo, factures).
Extrais un dossier de réservation UNIQUE — seulement si les fichiers concernent LE MÊME voyage.
Si les fichiers mélangent plusieurs voyages (dates/destinations/noms différents) : extraire UNIQUEMENT le voyage le plus complet et le signaler dans notes_client. Ne pas fusionner Lugano + Costa Rica + Panama.

document_status :
- confirmed = billet émis, voucher avec n° de réservation, transfert confirmé.
- quote = tarif / « none are on hold » / plusieurs options de chambres / pas de nom de réservation.
- identity = passeport ou pièce d’identité : ne pas créer de prestation.

Règles :
- Ne jamais inventer une information absente : mettre null.
- Ne jamais extraire de numéro de carte, même masqué.
- Ne pas créer de voyageurs vides (« 2 adults » sans noms ≠ 2 voyageurs).
- Dates de séjour : YYYY-MM-DD.
- Horaires : ISO 8601 uniquement s’ils sont écrits. Interdit d’inventer un check-in 15:00 / check-out 12:00.
- Devise : $ = USD, CHF = CHF, € = EUR. Ne pas forcer EUR si un symbole est présent.
- kind : flight | hotel | transfer | activity | insurance | fee.
- Un vol aller et un vol retour = DEUX items flight. PAS de vol retour s’il n’est pas imprimé.
- confirmation_ref = PNR GDS 6 lettres (Référence du dossier). details.pnr = réf. compagnie (ex. AF/Y2FYWL, X1/N0OP1Q).
- Compagnie émettrice (Hahn Air) ≠ transporteur (Air Panama) : airline / details.airline = l’opérateur réel, supplier = l’émetteur du billet.
- details.from / details.to = codes IATA pour les vols. Transfert : details.pickup / details.dropoff (pas from/to). L’heure d’un vol citée sur un bon Talixo n’est PAS l’heure de prise en charge.
- Deux chambres / deux « Booking name » / deux refs (97620170;97620172) = DEUX items hotel + les deux voyageurs.
- Devis hôtel avec plusieurs tarifs : document_status=quote, total_amount=null, un item par option de chambre (ne pas choisir la première).
- Voyageurs : casse normale (Elad Taieb, pas elad taieb).
- title : destination courte + type (ex. « Marrakech — aller-retour »).
- total_amount : total TTC s’il apparaît une seule fois. Si plusieurs options de prix, null.`;

export function collectIngestFiles(form: FormData) {
  const files: File[] = [];
  for (const key of ["files", "file"]) {
    for (const value of form.getAll(key)) {
      if (value instanceof File && value.size > 0) files.push(value);
    }
  }
  return files;
}

export function assertIngestFiles(files: File[]) {
  if (files.length === 0) throw new Error("Ajoutez au moins un PDF ou une photo.");
  if (files.length > MAX_INGEST_FILES) {
    throw new Error(`Maximum ${MAX_INGEST_FILES} fichiers.`);
  }
  for (const file of files) {
    if (file.size > MAX_INGEST_BYTES) {
      throw new Error(`${file.name} dépasse 10 Mo.`);
    }
    const type = file.type || guessMime(file.name);
    if (!ALLOWED_TYPES.has(type) && !type.startsWith("image/")) {
      throw new Error(`${file.name} : PDF ou image uniquement.`);
    }
  }
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

function ingestModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  return "google/gemini-2.5-flash";
}

type UserPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string };

async function imagePart(bytes: Uint8Array, mediaType: string): Promise<UserPart> {
  if (mediaType.includes("heic") || mediaType.includes("heif")) {
    const sharp = await trySharp();
    if (sharp) {
      try {
        const jpeg = await sharp(Buffer.from(bytes)).jpeg({ quality: 85 }).toBuffer();
        return { type: "image", image: new Uint8Array(jpeg), mediaType: "image/jpeg" };
      } catch {
        /* keep original */
      }
    }
  }
  return { type: "image", image: bytes, mediaType };
}

async function pdfParts(name: string, bytes: Uint8Array): Promise<UserPart[]> {
  const parts: UserPart[] = [];
  try {
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = extracted.text;
    parts.push({
      type: "text",
      text: `PDF « ${name} » (${extracted.totalPages} page${extracted.totalPages > 1 ? "s" : ""}) :\n${text.slice(0, 24000)}`,
    });
    const dense = text.replace(/\s/g, "").length;
    if (dense < 500) {
      const sharp = await trySharp();
      const max = Math.min(extracted.totalPages, 3);
      for (let page = 1; page <= max; page++) {
        const images = await extractImages(pdf, page);
        for (const img of images.slice(0, 6)) {
          if (!sharp) {
            parts.push({
              type: "image",
              image: new Uint8Array(img.data),
              mediaType: "image/jpeg",
            });
            continue;
          }
          const jpeg = await sharp(img.data, {
            raw: { width: img.width, height: img.height, channels: img.channels },
          })
            .jpeg({ quality: 80 })
            .toBuffer();
          parts.push({ type: "image", image: new Uint8Array(jpeg), mediaType: "image/jpeg" });
        }
      }
    }
  } catch {
    parts.push({
      type: "text",
      text: `PDF « ${name} » : texte illisible, s’appuyer sur le fichier binaire s’il est fourni.`,
    });
  }
  return parts;
}

async function buildIngestContent(files: File[]): Promise<UserPart[]> {
  const content: UserPart[] = [{ type: "text", text: PROMPT }];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = file.type || guessMime(file.name);
    if (mediaType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      content.push(...(await pdfParts(file.name, bytes)));
    } else {
      content.push(await imagePart(bytes, mediaType.startsWith("image/") ? mediaType : "image/jpeg"));
    }
  }
  return content;
}

export async function extractBookingFromFiles(files: File[]): Promise<BookingExtract> {
  if (!aiGatewayConfigured()) {
    throw new Error("Lecture automatique non configurée (OPENAI_API_KEY).");
  }
  assertIngestFiles(files);
  const content = await buildIngestContent(files);
  try {
    const result = await generateText({
      model: ingestModel(),
      output: Output.object({
        schema: bookingExtractSchema,
        name: "booking",
        description: "Dossier de réservation extrait des documents",
      }),
      messages: [{ role: "user", content }],
    });
    if (!result.output) {
      throw new Error("Lecture incomplète. Réessayez avec des fichiers plus lisibles.");
    }
    return result.output;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Lecture")) throw err;
    throw new Error("Lecture OpenAI impossible. Vérifiez OPENAI_API_KEY et réessayez.");
  }
}

function normalizeName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function matchCustomerId(customers: CrmCustomer[], extract: BookingExtract) {
  const email = extract.customer_email?.trim().toLowerCase();
  if (email) {
    const hit = customers.find((c) => c.email.toLowerCase() === email);
    if (hit) return hit.id;
  }
  const last = normalizeName(extract.customer_last_name);
  const first = normalizeName(extract.customer_first_name);
  if (!last) return null;
  const hits = customers.filter((c) => {
    if (normalizeName(c.last_name) !== last) return false;
    if (!first) return true;
    const cf = normalizeName(c.first_name);
    return cf === first || cf.startsWith(first) || first.startsWith(cf);
  });
  return hits.length === 1 ? hits[0].id : null;
}

function matchCompanion(
  companions: CrmCompanion[],
  first: string | null,
  last: string | null
) {
  const f = normalizeName(first);
  const l = normalizeName(last);
  if (!l && !f) return null;
  return (
    companions.find(
      (c) => normalizeName(c.last_name) === l && normalizeName(c.first_name) === f
    ) || null
  );
}

function isHolder(customer: CrmCustomer, first: string | null, last: string | null) {
  const f = normalizeName(first);
  const l = normalizeName(last);
  return Boolean(l) && normalizeName(customer.last_name) === l && (!f || normalizeName(customer.first_name) === f);
}

function cleanDetails(details: BookingExtract["items"][number]["details"] | undefined) {
  const raw = details || {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const text = emptyToNull(value);
    if (text) out[key] = text;
  }
  return out;
}

function itemKind(value: string | null | undefined): BookingItemKind {
  return (BOOKING_ITEM_KINDS as readonly string[]).includes(value || "")
    ? (value as BookingItemKind)
    : "fee";
}

async function uploadBookingFiles(
  bookingId: string,
  files: File[],
  visibleToClient: boolean,
  supabase: SupabaseClient
) {
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const path = `bookings/${bookingId}/${Date.now()}-${safeFileName(file.name)}`;
    await uploadCrmFile(path, bytes, file.type || guessMime(file.name));
    const { error } = await supabase.from("crm_booking_documents").insert({
      booking_id: bookingId,
      kind: file.type?.includes("pdf") ? "pdf" : "image",
      file_name: file.name,
      mime_type: file.type || guessMime(file.name),
      storage_path: path,
      visible_to_client: visibleToClient,
    });
    if (error) throw new Error(error.message);
  }
}

async function insertItemsAndTravelers(
  supabase: SupabaseClient,
  bookingId: string,
  extract: BookingExtract,
  customer: CrmCustomer,
  companions: CrmCompanion[],
  existingTravelers: { first_name: string | null; last_name: string | null }[]
) {
  let sort = 0;
  for (const item of extract.items || []) {
    const title = String(item.title || "").trim();
    if (!title) continue;
    const details = cleanDetails(item.details);
    if (item.confirmation_ref && !details.pnr) details.pnr = item.confirmation_ref;
    const { error } = await supabase.from("crm_booking_items").insert({
      booking_id: bookingId,
      kind: itemKind(item.kind),
      title,
      supplier: emptyToNull(item.supplier),
      confirmation_ref: emptyToNull(item.confirmation_ref),
      start_at: emptyToNull(item.start_at),
      end_at: emptyToNull(item.end_at),
      amount: item.amount == null ? null : Number(item.amount),
      sort_order: sort++,
      details,
    });
    if (error) throw new Error(error.message);
  }

  for (const traveler of extract.travelers || []) {
    const first = emptyToNull(traveler.first_name);
    const last = emptyToNull(traveler.last_name);
    if (!first && !last) continue;
    const dup = existingTravelers.some(
      (t) =>
        normalizeName(t.first_name) === normalizeName(first) &&
        normalizeName(t.last_name) === normalizeName(last)
    );
    if (dup) continue;
    const companion = matchCompanion(companions, first, last);
    const { error } = await supabase.from("crm_booking_travelers").insert({
      booking_id: bookingId,
      companion_id: companion?.id || null,
      is_account_holder: isHolder(customer, first, last),
      first_name: first || companion?.first_name || null,
      last_name: last || companion?.last_name || null,
    });
    if (error) throw new Error(error.message);
    existingTravelers.push({ first_name: first, last_name: last });
  }
}

export async function persistNewBookingFromExtract(opts: {
  customerId: string;
  extract: BookingExtract;
  files: File[];
  status: BookingStatus;
  visibleToClient: boolean;
}) {
  const admin = createServiceClient();
  const [{ data: customer }, { data: companions }] = await Promise.all([
    admin.from("crm_customers").select("*").eq("id", opts.customerId).maybeSingle(),
    admin.from("crm_travel_companions").select("*").eq("customer_id", opts.customerId),
  ]);
  if (!customer) throw new Error("Client introuvable");
  if (opts.extract.document_status === "identity") {
    throw new Error("Document d’identité : enregistrez-le dans le profil, pas en réservation.");
  }
  const reference = await nextBookingReference(admin);
  const extract = opts.extract;
  const title =
    emptyToNull(extract.title) ||
    emptyToNull(extract.destination) ||
    "Voyage";
  const { data, error } = await admin
    .from("crm_bookings")
    .insert({
      customer_id: opts.customerId,
      reference,
      title,
      destination: emptyToNull(extract.destination),
      status: opts.status,
      start_date: emptyToNull(extract.start_date),
      end_date: emptyToNull(extract.end_date),
      currency: emptyToNull(extract.currency) || "EUR",
      total_amount: Number(extract.total_amount || 0),
      notes_client: emptyToNull(extract.notes_client),
      notes_internal:
        extract.document_status === "quote"
          ? "Devis importé — tarifs non bloqués, à confirmer."
          : "Dossier créé par lecture de documents.",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Création impossible");
  const booking = data as CrmBooking;
  await insertItemsAndTravelers(
    admin,
    booking.id,
    extract,
    customer as CrmCustomer,
    (companions || []) as CrmCompanion[],
    []
  );
  await uploadBookingFiles(booking.id, opts.files, opts.visibleToClient, admin);
  await syncBookingDebit(admin, booking);
  const hotel = extract.items?.find((item) => item.kind === "hotel");
  scheduleBookingCover(booking, {
    hotel: hotel?.details?.hotel_name || hotel?.title || null,
  });
  return booking;
}

export async function applyExtractToBooking(opts: {
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  files: File[];
  visibleToClient: boolean;
}) {
  const admin = createServiceClient();
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  if (!booking || booking.customer_id !== opts.customerId) {
    throw new Error("Réservation introuvable");
  }
  const [{ data: customer }, { data: companions }, { data: travelers }] = await Promise.all([
    admin.from("crm_customers").select("*").eq("id", opts.customerId).maybeSingle(),
    admin.from("crm_travel_companions").select("*").eq("customer_id", opts.customerId),
    admin.from("crm_booking_travelers").select("first_name, last_name").eq("booking_id", opts.bookingId),
  ]);
  if (!customer) throw new Error("Client introuvable");
  if (opts.extract.document_status === "identity") {
    throw new Error("Document d’identité : enregistrez-le dans le profil, pas en réservation.");
  }
  await insertItemsAndTravelers(
    admin,
    opts.bookingId,
    opts.extract,
    customer as CrmCustomer,
    (companions || []) as CrmCompanion[],
    (travelers || []) as { first_name: string | null; last_name: string | null }[]
  );
  await uploadBookingFiles(opts.bookingId, opts.files, opts.visibleToClient, admin);
  const patch: Record<string, unknown> = {};
  if (!booking.title && opts.extract.title) patch.title = opts.extract.title;
  if (!booking.destination && opts.extract.destination) patch.destination = opts.extract.destination;
  if (!booking.start_date && opts.extract.start_date) patch.start_date = opts.extract.start_date;
  if (!booking.end_date && opts.extract.end_date) patch.end_date = opts.extract.end_date;
  if (!Number(booking.total_amount) && opts.extract.total_amount) {
    patch.total_amount = Number(opts.extract.total_amount);
  }
  if (Object.keys(patch).length) {
    await admin.from("crm_bookings").update(patch).eq("id", opts.bookingId);
  }
  const { data: refreshed } = await admin
    .from("crm_bookings")
    .select("*")
    .eq("id", opts.bookingId)
    .maybeSingle();
  const next = (refreshed || booking) as CrmBooking;
  await syncBookingDebit(admin, next, booking.status as BookingStatus);
  const hotel = opts.extract.items?.find((item) => item.kind === "hotel");
  scheduleBookingCover(
    {
      ...next,
      destination: (patch.destination as string) || next.destination,
      title: (patch.title as string) || next.title,
    } as CrmBooking,
    { hotel: hotel?.details?.hotel_name || hotel?.title || null }
  );
  return next;
}

export function parseExtractPayload(raw: unknown): BookingExtract {
  const parsed = bookingExtractSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données extraites invalides");
  return parsed.data;
}
