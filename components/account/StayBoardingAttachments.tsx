import { FilePreviewGrid } from "@/components/crm/FilePreview";
import { loadClientBoardingOffer } from "@/lib/crm/client-boarding-pass-load";
import { attachmentPreviews, boardingPassPreviews } from "@/lib/crm/preview-files";
import type { CrmBookingDocument } from "@/lib/crm/types";

/**
 * Cartes d’embarquement du séjour, y compris déposées cachées.
 * Le PDF est lu ici, dans un bloc suspendu : le reste de la page n’attend pas.
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
  const offer = await loadClientBoardingOffer(bookingId);
  const covered = new Set([
    ...offer.cards.map((card) => card.documentId),
    ...offer.full.map((file) => file.documentId),
  ]);
  const fallback = visiblePasses.filter((doc) => doc.storage_path && !covered.has(doc.id));
  const files = [
    ...boardingPassPreviews(offer.cards, offer.full, reference),
    ...attachmentPreviews(fallback, [], reference),
  ];
  if (!files.length) {
    return showEmpty ? <p className="text-sm text-muted">Aucune pièce jointe sur cette réservation.</p> : null;
  }
  return <FilePreviewGrid files={files} />;
}
