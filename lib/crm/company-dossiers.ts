export type OpenDossier = {
  id: string;
  reference: string;
  title?: string | null;
  destination?: string | null;
  status?: string | null;
  archived_at?: string | null;
  payer_kind?: string | null;
  billing_company_id?: string | null;
};

/** Dossier encore ouvert, facturé en particulier. */
export function isOpenPersonalDossier(row: OpenDossier) {
  if (row.archived_at) return false;
  if (row.status === "cancelled") return false;
  if (row.payer_kind === "company") return false;
  if (row.billing_company_id) return false;
  return true;
}

export function openPersonalDossiers<T extends OpenDossier>(rows: T[]) {
  return rows.filter(isOpenPersonalDossier);
}
