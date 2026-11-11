import { BoardingPassGroups } from "@/components/account/BoardingPassGroups";
import { boardingSegments, documentFlightId } from "@/lib/crm/boarding-pass-groups";
import { loadClientBoardingOffer } from "@/lib/crm/client-boarding-pass-load";
import { attachmentPreviews, groupedBoardingPasses } from "@/lib/crm/preview-files";
import type { CrmBookingDocument } from "@/lib/crm/types";

/**
 * Cartes d’embarquement du séjour, y compris déposées cachées.
 * Le PDF est lu ici, dans un bloc suspendu : le reste de la page n’attend pas.
 * Le rangement par vol utilise les segments déjà chargés, sans appel externe.
 * Les autres pièces cachées (factures fournisseur) ne sont pas lues.
 */
export async function StayBoardingAttachments({
  bookingId,
  reference,
  showEmpty,
  visiblePasses = [],
}: {
  bookingId: string;
  reference: string;
  showEmpty: boolean;
  /** Pièces déjà publiées : repli /api/files si la lecture du PDF n’a rien produit. */
  visiblePasses?: CrmBookingDocument[];
}) {
  const bundle = await loadClientBoardingOffer(bookingId);
  const offer = bundle.offer;
  const covered = new Set([
    ...offer.cards.map((card) => card.documentId),
    ...offer.full.map((file) => file.documentId),
  ]);
  const segments = boardingSegments(bundle.flights, { clientVisible: true });
  const fallback = visiblePasses.filter((doc) => doc.storage_path && !covered.has(doc.id));
  const groups = groupedBoardingPasses({
    cards: offer.cards,
    full: offer.full,
    segments,
    travelers: bundle.travelers,
    reference,
    extras: fallback.flatMap((doc) => {
      const preview = attachmentPreviews([doc], [], reference)[0];
      if (!preview) return [];
      return [{ id: doc.id, itemId: documentFlightId(doc, segments), firstName: "", lastName: "", preview }];
    }),
  });
  const empty = !groups.upcoming.length && !groups.past.length && !groups.other;
  if (empty) {
    return showEmpty ? <p className="text-sm text-muted">Aucune pièce jointe sur cette réservation.</p> : null;
  }
  return <BoardingPassGroups groups={groups} />;
}
