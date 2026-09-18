export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

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
