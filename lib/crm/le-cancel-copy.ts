/**
 * Textes et forme du bouton d’annulation client.
 * Aucun import serveur : le composant client ne doit pas tirer Little Emperors ni node:crypto.
 */

export const CLIENT_CANCEL_ADVISOR = "Contactez votre conseiller.";
export const CLIENT_CANCEL_REFUSED = "Cette annulation n’est plus gratuite. Contactez votre conseiller.";
export const CLIENT_CANCEL_NOT_SENT = "Rien n’a été annulé. Contactez votre conseiller.";
export const CLIENT_CANCEL_CARD_LAG =
  "L’hôtel a annulé la réservation. Contactez votre conseiller si elle apparaît encore.";

export type ClientHotelCancelOffer =
  | {
      itemId: string;
      mode: "free";
      hotelName: string;
      stayLabel: string;
      untilLabel: string;
    }
  | { itemId: string; mode: "advisor" };

export function clientCancelQuestion(offer: { hotelName: string; stayLabel: string; untilLabel: string }) {
  return `Annuler ${offer.hotelName}, ${offer.stayLabel} ? Annulation gratuite jusqu’au ${offer.untilLabel}.`;
}
