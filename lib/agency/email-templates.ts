import { siteConfig } from "@/lib/site";

export function buildHotelPaymentEmail(params: {
  hotelName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  confirmationNumber?: string | null;
  totalCost?: string | null;
  currency?: string | null;
}) {
  const subject = `Demande de lien de paiement — ${params.hotelName} — ${params.guestName}`;
  const body = `Bonjour,

Je vous contacte de la part de ${siteConfig.name} concernant la réservation suivante :

Hôtel : ${params.hotelName}
Client : ${params.guestName}
Séjour : ${params.checkIn} → ${params.checkOut}
${params.confirmationNumber ? `Confirmation : ${params.confirmationNumber}` : ""}
${params.totalCost ? `Montant : ${params.totalCost} ${params.currency || ""}` : ""}

Pourriez-vous me transmettre le lien de paiement pour le règlement de la totalité de la réservation ?

Je reste à votre disposition pour toute information complémentaire.

Cordialement,
${siteConfig.name}
${siteConfig.phoneDisplay}
${siteConfig.contactEmail}
`;

  return { subject, body: body.replace(/\n{3,}/g, "\n\n").trim() };
}
