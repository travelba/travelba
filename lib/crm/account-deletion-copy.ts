/** Textes de la suppression de compte. Guideline Apple 5.1.1(v) : l’effacement part tout de suite. */

const DELETED_EMAIL_DOMAIN = "compte.invalid";

/** Adresse non routable, unique, sans donnée personnelle. Sert de marque si la colonne n’est pas encore là. */
export function deletedAccountEmail(customerId: string) {
  return `supprime+${customerId}@${DELETED_EMAIL_DOMAIN}`;
}

export function isDeletedAccountEmail(email: string | null | undefined) {
  return /^supprime\+[0-9a-f-]{36}@compte\.invalid$/i.test((email || "").trim());
}

export const ACCOUNT_DELETION_TITLE = "Supprimer mon compte";

export const ACCOUNT_DELETION_CONFIRM = "Supprimer définitivement mon compte";

export const ACCOUNT_DELETION_CANCEL = "Annuler";

export const ACCOUNT_DELETED_TITLE = "Votre compte a été supprimé";

export const ACCOUNT_DELETED_PATH = "/compte-supprime";

export const ACCOUNT_DELETION_LEAD =
  "Le compte est effacé tout de suite. Les dossiers, factures et règlements exigés par la loi restent à l’agence, sans accès à l’espace.";

/** Ce que le dialogue confirme. Les boutons restent visibles : le texte défile, pas eux. */
export const ACCOUNT_DELETION_PARAGRAPHS = [
  "La suppression est immédiate. Vous ne pourrez plus vous connecter.",
  "Sont effacés tout de suite : votre nom, votre e-mail, votre téléphone, votre adresse, votre date de naissance, vos passeports et pièces d’identité, vos préférences, Face ID et les appareils enregistrés.",
  "L’agence conserve les dossiers, les factures et les règlements, sans votre compte. La comptabilité est gardée dix ans. Le contrat de voyage l’est aussi, le temps prévu par le code du tourisme.",
] as const;
