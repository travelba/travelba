import { resolveNationality } from "./countries";
import { emptyToNull } from "./identity";

export type DocumentIdentityFields = {
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  nationality: string | null;
  sex: string | null;
};

export function identityFieldsFromForm(form: FormData): DocumentIdentityFields {
  const sex = emptyToNull(form.get("sex"));
  return {
    first_name: emptyToNull(form.get("first_name")),
    last_name: emptyToNull(form.get("last_name")),
    usage_name: emptyToNull(form.get("usage_name")),
    birth_date: emptyToNull(form.get("birth_date")),
    nationality: resolveNationality(
      emptyToNull(form.get("nationality")),
      emptyToNull(form.get("issuing_country"))
    ),
    sex: sex === "M" || sex === "F" || sex === "X" ? sex : null,
  };
}

export function filledIdentity(fields: DocumentIdentityFields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
}

export function nationalityFromIdentity(fields: {
  nationality?: string | null;
  issuing_country?: string | null;
}): string | null {
  return resolveNationality(fields.nationality, fields.issuing_country);
}

export function identityNationalityFromSources(
  personNationality: string | null | undefined,
  docs?: { nationality?: string | null; issuing_country?: string | null }[]
): string {
  const fromPerson = resolveNationality(personNationality);
  if (fromPerson) return fromPerson;
  for (const doc of docs || []) {
    const code = resolveNationality(doc.nationality, doc.issuing_country);
    if (code) return code;
  }
  return "";
}

export function appendIdentityFields(
  form: FormData,
  fields: {
    first_name?: string | null;
    last_name?: string | null;
    usage_name?: string | null;
    birth_date?: string | null;
    nationality?: string | null;
    sex?: string | null;
  },
  applyIdentity?: boolean
) {
  form.set("first_name", fields.first_name || "");
  form.set("last_name", fields.last_name || "");
  form.set("usage_name", fields.usage_name || "");
  form.set("birth_date", fields.birth_date || "");
  form.set("nationality", fields.nationality || "");
  form.set("sex", fields.sex || "");
  if (applyIdentity !== undefined) {
    form.set("apply_identity", applyIdentity ? "1" : "0");
  }
}

export function documentHolderName(
  doc: {
    first_name: string | null;
    last_name: string | null;
    companion_id: string | null;
  },
  customer: { first_name: string | null; last_name: string | null },
  companions: { id: string; first_name: string | null; last_name: string | null }[]
) {
  const stored = [doc.first_name, doc.last_name].filter(Boolean).join(" ").trim();
  if (stored) return stored;
  if (doc.companion_id) {
    const companion = companions.find((item) => item.id === doc.companion_id);
    if (companion) {
      return [companion.first_name, companion.last_name].filter(Boolean).join(" ").trim();
    }
  }
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
}
