import { resolveNationality } from "./countries";
import { emptyToNull, identityOverwriteWarning } from "./identity";
import { foldName, matchTravelerToParty, namesReferToSamePerson, type PersonName } from "./person-match";

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

export type DocumentTarget = {
  /** `""` = le titulaire, sinon l’id du compagnon. */
  companionId: string;
  applyIdentity: boolean;
  /** Nom lu qui ne correspond à personne du foyer : la pièce entre au coffre sans toucher le profil. */
  mismatch: string | null;
};

function readName(person: PersonName | null | undefined) {
  return [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Présélection « Pour qui » d’après le nom lu sur la pièce.
 * Compagnon reconnu → sa fiche. Titulaire reconnu, ou titulaire encore sans nom → « Moi ».
 * Inconnu → « Moi » mais sans report d’identité : le passeport d’un proche ne renomme pas le titulaire.
 */
export function preselectDocumentTarget(
  identity: PersonName | null | undefined,
  holder: PersonName,
  companions: (PersonName & { id: string })[]
): DocumentTarget {
  const read = readName(identity);
  if (!identity || !read) return { companionId: "", applyIdentity: true, mismatch: null };
  const holderNamed = Boolean(foldName(holder.first_name) || foldName(holder.last_name));
  if (!holderNamed) return { companionId: "", applyIdentity: true, mismatch: null };
  const match = matchTravelerToParty(identity, holder, companions);
  if (match?.kind === "companion") return { companionId: match.id, applyIdentity: true, mismatch: null };
  if (match?.kind === "holder" || namesReferToSamePerson(identity, holder)) {
    return { companionId: "", applyIdentity: true, mismatch: null };
  }
  return { companionId: "", applyIdentity: false, mismatch: read };
}

/**
 * Message sous le scan, selon la personne choisie et la case « Reporter … sur le profil ».
 * Report coché et nom différent → « seront mis à jour ». Report décoché et inconnu → la pièce
 * entre au coffre sans modifier la fiche. Même personne → rien.
 */
export function documentNameNotice(
  identity: PersonName | null | undefined,
  target: PersonName | null | undefined,
  opts: { applyIdentity: boolean; isHolder: boolean }
): string | null {
  const read = readName(identity);
  if (!identity || !target || !read) return null;
  const current = readName(target);
  if (!current) return null;
  if (opts.applyIdentity) return identityOverwriteWarning(target, identity);
  if (namesReferToSamePerson(identity, target)) return null;
  if (opts.isHolder) {
    return `Le nom lu (${read}) diffère du vôtre : la pièce sera ajoutée au coffre sans modifier votre profil.`;
  }
  return `Le nom lu (${read}) diffère de celui de ${current} : la pièce sera ajoutée au coffre sans modifier sa fiche.`;
}
