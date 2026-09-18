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

/** Message FR neutre pour une erreur Supabase/Postgres ; le détail part dans les logs serveur. */
export function dbErrorMessage(error: DbErrorLike, fallback = "Opération impossible. Réessayez.") {
  const code = error?.code ?? "";
  switch (code) {
    case "23505":
      return "Cette valeur existe déjà.";
    case "23503":
      return "Élément lié introuvable.";
    case "23502":
      return "Un champ obligatoire est vide.";
    case "22P02":
    case "22007":
    case "22008":
      return "Format de valeur invalide.";
    case "PGRST116":
      return "Élément introuvable.";
    case "42501":
      return "Accès refusé.";
    default:
      return fallback;
  }
}
