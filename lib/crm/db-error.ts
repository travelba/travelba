export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/** Message FR pour une erreur Supabase Auth lors d’un changement de mot de passe. */
export function passwordErrorMessage(error: DbErrorLike) {
  switch (error?.code ?? "") {
    case "same_password":
      return "Choisissez un mot de passe différent de l’ancien.";
    case "weak_password":
      return "Mot de passe trop simple : ajoutez des lettres, chiffres ou symboles.";
    case "session_expired":
    case "session_not_found":
    case "reauthentication_needed":
      return "Session expirée. Demandez un nouveau lien de connexion.";
    case "over_request_rate_limit":
      return "Trop de tentatives. Réessayez dans quelques minutes.";
    default:
      return "Enregistrement du mot de passe impossible. Réessayez.";
  }
}

const COLUMN_LABELS: Record<string, string> = {
  title: "titre",
  customer_id: "client",
  email: "e-mail",
  first_name: "prénom",
  last_name: "nom",
  phone: "téléphone",
  billing_customer_id: "payeur",
  booking_id: "dossier",
  kind: "type",
  storage_path: "fichier",
  reference: "référence",
};

export function dbColumnFromMessage(message: string | null | undefined) {
  const match = String(message || "").match(/column "([^"]+)"/i);
  return match?.[1] || null;
}

function columnLabel(column: string | null) {
  if (!column) return null;
  return COLUMN_LABELS[column] || column.replace(/_/g, " ");
}

/** Message FR neutre pour une erreur Supabase/Postgres ; le détail part dans les logs serveur. */
export function dbErrorMessage(error: DbErrorLike, fallback = "Opération impossible. Réessayez.") {
  const code = error?.code ?? "";
  const column = columnLabel(dbColumnFromMessage(error?.message));
  switch (code) {
    case "23505":
      return column ? `Cette valeur existe déjà (${column}).` : "Cette valeur existe déjà.";
    case "23503":
      return column ? `Élément lié introuvable (${column}).` : "Élément lié introuvable.";
    case "23502":
      return column
        ? `Le champ obligatoire « ${column} » est vide.`
        : "Un champ obligatoire est vide.";
    case "22P02":
    case "22007":
    case "22008":
      return column ? `Format invalide pour « ${column} ».` : "Format de valeur invalide.";
    case "PGRST116":
      return "Élément introuvable.";
    case "42501":
      return "Accès refusé.";
    case "42P10":
      return "Enregistrement impossible (contrainte de dossier). Réessayez.";
    default:
      return fallback;
  }
}
