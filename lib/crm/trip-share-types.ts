/** Forme partagée du compagnon à qui envoyer le lien. Sans `node:crypto`. */

export type ShareCompanion = {
  travelerId: string;
  companionId: string;
  firstName: string;
  lastName: string;
  hasPhone: boolean;
};
