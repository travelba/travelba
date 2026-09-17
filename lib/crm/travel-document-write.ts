import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCountryCode } from "./countries";
import {
  filledIdentity,
  identityFieldsFromForm,
  type DocumentIdentityFields,
} from "./document-identity";
import { emptyToNull } from "./identity";
import { cleanPersonalNumber } from "./passport-extract";
import { DOC_TYPES, type CrmTravelDocument, type TravelDocType } from "./types";

export type TravelDocumentInput = {
  customerId: string;
  companionId?: string | null;
  bookingId?: string | null;
  travelerId?: string | null;
  docType?: string | null;
  number?: string | null;
  issuingCountry?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  placeOfBirth?: string | null;
  authority?: string | null;
  personalNumber?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
} & Partial<DocumentIdentityFields>;

function asDocType(value: string | null | undefined): TravelDocType {
  const raw = String(value || "passport");
  return (DOC_TYPES as readonly string[]).includes(raw) ? (raw as TravelDocType) : "passport";
}

export async function assertBookingForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  bookingId: string | null
) {
  if (!bookingId) return null;
  const { data, error } = await supabase
    .from("crm_bookings")
    .select("id, customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.customer_id !== customerId) throw new Error("Réservation introuvable");
  return data;
}

export async function assertTravelerOnBooking(
  supabase: SupabaseClient,
  bookingId: string | null,
  travelerId: string | null
) {
  if (!travelerId) return null;
  if (!bookingId) throw new Error("Voyage requis pour rattacher un voyageur");
  const { data, error } = await supabase
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder")
    .eq("id", travelerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.booking_id !== bookingId) throw new Error("Voyageur introuvable");
  return data;
}

async function retirePreviousSameType(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    companionId: string | null;
    bookingId: string | null;
    travelerId: string | null;
    docType: TravelDocType;
    keepId: string;
  }
) {
  let query = supabase
    .from("crm_travel_documents")
    .delete()
    .eq("customer_id", input.customerId)
    .eq("doc_type", input.docType)
    .neq("id", input.keepId);
  if (input.bookingId && input.travelerId) {
    query = query.eq("booking_id", input.bookingId).eq("traveler_id", input.travelerId);
  } else {
    query = query.is("booking_id", null);
    query = input.companionId
      ? query.eq("companion_id", input.companionId)
      : query.is("companion_id", null);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function insertTravelDocument(
  supabase: SupabaseClient,
  input: TravelDocumentInput
) {
  const bookingId = emptyToNull(input.bookingId);
  const travelerId = emptyToNull(input.travelerId);
  await assertBookingForCustomer(supabase, input.customerId, bookingId);
  const traveler = await assertTravelerOnBooking(supabase, bookingId, travelerId);
  const companionId =
    emptyToNull(input.companionId) || traveler?.companion_id || null;
  const docType = asDocType(input.docType);
  const identity: DocumentIdentityFields = {
    first_name: emptyToNull(input.first_name),
    last_name: emptyToNull(input.last_name),
    birth_date: emptyToNull(input.birth_date),
    nationality:
      resolveCountryCode(String(input.nationality || "")) || emptyToNull(input.nationality),
    sex: input.sex === "M" || input.sex === "F" || input.sex === "X" ? input.sex : null,
  };
  const { data, error } = await supabase
    .from("crm_travel_documents")
    .insert({
      customer_id: input.customerId,
      companion_id: companionId,
      booking_id: bookingId,
      traveler_id: travelerId,
      doc_type: docType,
      number: emptyToNull(input.number),
      issuing_country:
        resolveCountryCode(String(input.issuingCountry || "")) ||
        emptyToNull(input.issuingCountry),
      issued_on: emptyToNull(input.issuedOn),
      expires_on: emptyToNull(input.expiresOn),
      place_of_birth: emptyToNull(input.placeOfBirth),
      authority: emptyToNull(input.authority),
      personal_number: cleanPersonalNumber(input.personalNumber),
      ...identity,
      storage_path: emptyToNull(input.storagePath),
      file_name: emptyToNull(input.fileName),
      mime_type: emptyToNull(input.mimeType),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await retirePreviousSameType(supabase, {
    customerId: input.customerId,
    companionId,
    bookingId,
    travelerId,
    docType,
    keepId: data.id,
  });
  return data as CrmTravelDocument;
}

export async function cloneTravelDocument(
  supabase: SupabaseClient,
  sourceId: string,
  customerId: string,
  opts: { bookingId: string; travelerId?: string | null; companionId?: string | null }
) {
  const { data: source, error } = await supabase
    .from("crm_travel_documents")
    .select("*")
    .eq("id", sourceId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) throw new Error("Document source introuvable");
  return insertTravelDocument(supabase, {
    customerId,
    companionId: opts.companionId ?? source.companion_id,
    bookingId: opts.bookingId,
    travelerId: opts.travelerId,
    docType: source.doc_type,
    number: source.number,
    issuingCountry: source.issuing_country,
    issuedOn: source.issued_on,
    expiresOn: source.expires_on,
    placeOfBirth: source.place_of_birth,
    authority: source.authority,
    personalNumber: source.personal_number,
    first_name: source.first_name,
    last_name: source.last_name,
    birth_date: source.birth_date,
    nationality: source.nationality,
    sex: source.sex,
    storagePath: source.storage_path,
    fileName: source.file_name,
    mimeType: source.mime_type,
  });
}

export function travelDocumentFromForm(form: FormData, customerId: string): TravelDocumentInput {
  const identity = identityFieldsFromForm(form);
  return {
    customerId,
    companionId: emptyToNull(form.get("companion_id")),
    bookingId: emptyToNull(form.get("booking_id")),
    travelerId: emptyToNull(form.get("traveler_id")),
    docType: String(form.get("doc_type") || "passport"),
    number: emptyToNull(form.get("number")),
    issuingCountry: emptyToNull(form.get("issuing_country")),
    issuedOn: emptyToNull(form.get("issued_on")),
    expiresOn: emptyToNull(form.get("expires_on")),
    placeOfBirth: emptyToNull(form.get("place_of_birth")),
    authority: emptyToNull(form.get("authority")),
    personalNumber: emptyToNull(form.get("personal_number")),
    ...identity,
  };
}

export async function applyIdentityFromForm(
  supabase: SupabaseClient,
  form: FormData,
  customerId: string,
  companionId: string | null,
  travelerId?: string | null
) {
  if (String(form.get("apply_identity") || "1") !== "1") return;
  const filled = filledIdentity(identityFieldsFromForm(form));
  if (Object.keys(filled).length === 0) return;
  if (companionId) {
    const { error } = await supabase
      .from("crm_travel_companions")
      .update(filled)
      .eq("id", companionId)
      .eq("customer_id", customerId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("crm_customers").update(filled).eq("id", customerId);
    if (error) throw new Error(error.message);
  }
  if (travelerId && (filled.first_name || filled.last_name)) {
    const travelerPatch: Record<string, string> = {};
    if (typeof filled.first_name === "string") travelerPatch.first_name = filled.first_name;
    if (typeof filled.last_name === "string") travelerPatch.last_name = filled.last_name;
    const travelerUpdate = await supabase
      .from("crm_booking_travelers")
      .update(travelerPatch)
      .eq("id", travelerId);
    if (travelerUpdate.error) throw new Error(travelerUpdate.error.message);
  }
}
