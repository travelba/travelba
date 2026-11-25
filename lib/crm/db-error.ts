export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

/** Message pour une erreur Supabase Auth lors d’un changement de mot de passe. */
export function passwordErrorMessage(error: DbErrorLike, lang: "fr" | "en" = "fr") {
  const english = lang === "en";
  switch (error?.code ?? "") {
    case "same_password":
      return english
        ? "Choose a password that is different from the previous one."
        : "Choisissez un mot de passe différent de l’ancien.";
    case "weak_password":
      return english
        ? "Password is too simple. Add letters, numbers, or symbols."
        : "Mot de passe trop simple : ajoutez des lettres, chiffres ou symboles.";
    case "session_expired":
    case "session_not_found":
    case "reauthentication_needed":
      return english
        ? "This session has expired. Ask for a new sign-in link."
        : "Session expirée. Demandez un nouveau lien de connexion.";
    case "over_request_rate_limit":
      return english ? "Too many attempts. Try again in a few minutes." : "Trop de tentatives. Réessayez dans quelques minutes.";
    case "current_password_required":
      return english
        ? "A password is already set. Sign in with it."
        : "Un mot de passe est déjà défini. Connectez-vous avec.";
    default:
      return english ? "The password could not be saved. Try again." : "Enregistrement du mot de passe impossible. Réessayez.";
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

/** Contrainte nommée → phrase utile. Le code 23505 seul ne dit pas quelle valeur. */
function constraintMessage(message: string | null | undefined) {
  const text = String(message || "");
  if (text.includes("crm_booking_documents_booking_sha")) {
    return "Ce billet est déjà dans le dossier. Les cartes n’ont pas été supprimées, rien n’a été enregistré.";
  }
  return null;
}

/** Message FR neutre pour une erreur Supabase/Postgres ; le détail part dans les logs serveur. */
export function dbErrorMessage(error: DbErrorLike, fallback = "Opération impossible. Réessayez.") {
  const code = error?.code ?? "";
  const column = columnLabel(dbColumnFromMessage(error?.message));
  switch (code) {
    case "23505":
      return constraintMessage(error?.message) || (column ? `Cette valeur existe déjà (${column}).` : "Cette valeur existe déjà.");
    case "P0002":
      return "Carte introuvable.";
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
