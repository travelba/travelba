import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveNationality } from "./countries";
import { safeFileName, uploadCrmFile } from "./files";
import { emptyToNull, type ExtractedIdentity } from "./identity";
import { assignPassportsToParty, type PassportTarget } from "./passport-assign";
import { identitiesFromForm } from "./passport-extract";
import type { PersonName } from "./person-match";
import { reconcileCustomerParty } from "./reconcile-party";
import {
  applyIdentityFromIdentity,
  insertTravelDocument,
} from "./travel-document-write";
import type { CrmTravelDocument } from "./types";

function companionIdOf(target: PassportTarget): string | null {
  return target.kind === "companion" ? target.id : null;
}

export async function persistImportedPassports(
  supabase: SupabaseClient,
  opts: {
    customerId: string;
    holder: PersonName;
    identities: ExtractedIdentity[];
    preferCompanionId?: string | null;
    createUnmatchedOnly?: boolean;
    file?: File | null;
    applyIdentity?: boolean;
  }
): Promise<{ documents: CrmTravelDocument[]; createdCompanions: number }> {
  const { data: companions, error } = await supabase
    .from("crm_travel_companions")
    .select("id, first_name, last_name")
    .eq("customer_id", opts.customerId);
  if (error) throw new Error(error.message);

  const prefer = opts.createUnmatchedOnly
    ? null
    : opts.preferCompanionId
      ? { kind: "companion" as const, id: opts.preferCompanionId }
      : { kind: "holder" as const };

  const assignments = assignPassportsToParty(
    opts.identities,
    opts.holder,
    companions || [],
    prefer
  );

  let storagePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  if (opts.file && opts.file.size > 0) {
    const bytes = Buffer.from(await opts.file.arrayBuffer());
    storagePath = `customers/${opts.customerId}/documents/${Date.now()}-${safeFileName(opts.file.name)}`;
    await uploadCrmFile(storagePath, bytes, opts.file.type || "application/octet-stream");
    fileName = opts.file.name;
    mimeType = opts.file.type;
  }

  const documents: CrmTravelDocument[] = [];
  let createdCompanions = 0;

  for (const assignment of assignments) {
    let companionId = companionIdOf(assignment.target);
    if (assignment.target.kind === "create") {
      const first = (assignment.identity.first_name || "").trim();
      const last = (assignment.identity.last_name || "").trim();
      if (!first || !last) continue;
      const inserted = await supabase
        .from("crm_travel_companions")
        .insert({
          customer_id: opts.customerId,
          first_name: first,
          last_name: last,
          birth_date: assignment.identity.birth_date,
          sex: assignment.identity.sex,
          nationality: resolveNationality(
            assignment.identity.nationality,
            assignment.identity.issuing_country
          ),
        })
        .select("id")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      companionId = inserted.data.id;
      createdCompanions += 1;
    }

    const document = await insertTravelDocument(supabase, {
      customerId: opts.customerId,
      companionId,
      docType: assignment.identity.doc_type,
      number: assignment.identity.number,
      issuingCountry: assignment.identity.issuing_country,
      issuedOn: assignment.identity.issued_on,
      expiresOn: assignment.identity.expires_on,
      placeOfBirth: assignment.identity.place_of_birth,
      authority: assignment.identity.authority,
      personalNumber: assignment.identity.personal_number,
      first_name: assignment.identity.first_name,
      last_name: assignment.identity.last_name,
      birth_date: assignment.identity.birth_date,
      nationality: assignment.identity.nationality,
      sex: assignment.identity.sex,
      storagePath,
      fileName,
      mimeType,
    });
    documents.push(document);
    if (opts.applyIdentity !== false) {
      await applyIdentityFromIdentity(supabase, opts.customerId, companionId, assignment.identity);
    }
  }

  await reconcileCustomerParty(opts.customerId);
  return { documents, createdCompanions };
}

export async function persistPassportsFromForm(
  supabase: SupabaseClient,
  form: FormData,
  customerId: string,
  holder?: PersonName
) {
  const mode = String(form.get("import_party") || "");
  if (mode !== "1" && mode !== "new") return null;
  const identities = identitiesFromForm(form);
  if (!identities.length) return null;
  let resolvedHolder = holder;
  if (!resolvedHolder) {
    const { data, error } = await supabase
      .from("crm_customers")
      .select("first_name, last_name")
      .eq("id", customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    resolvedHolder = {
      first_name: data?.first_name || null,
      last_name: data?.last_name || null,
    };
  }
  const file = form.get("file");
  return persistImportedPassports(supabase, {
    customerId,
    holder: resolvedHolder,
    identities,
    preferCompanionId: emptyToNull(form.get("companion_id")),
    createUnmatchedOnly: mode === "new",
    file: file instanceof File ? file : null,
    applyIdentity: String(form.get("apply_identity") || "1") === "1",
  });
}
