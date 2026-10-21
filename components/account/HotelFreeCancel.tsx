"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { postJson } from "@/lib/crm/client-fetch";
import {
  CLIENT_CANCEL_ADVISOR,
  CLIENT_CANCEL_REFUSED,
  clientCancelQuestion,
  type ClientHotelCancelOffer,
} from "@/lib/crm/le-free-cancel";

/** Bouton d’annulation gratuite, ou la phrase conseiller. Rien d’autre. */
export function HotelFreeCancel({
  reference,
  offer,
}: {
  reference: string;
  offer: ClientHotelCancelOffer;
}) {
  const router = useRouter();
  if (offer.mode === "advisor") {
    return <p className="text-sm text-muted">{CLIENT_CANCEL_ADVISOR}</p>;
  }
  const question = clientCancelQuestion(offer);
  return (
    <ConfirmAction
      label="Annuler cette réservation"
      confirmLabel="Confirmer l’annulation"
      cancelLabel="Garder la réservation"
      question={question}
      hint="Aucun frais. L’annulation part directement chez l’hôtel."
      tone="danger"
      ariaLabel={`Annuler ${offer.hotelName}`}
      wrapperClassName="pt-1"
      onConfirm={async () => {
        const result = await postJson<{ ok?: boolean }>(
          `/api/client/bookings/${encodeURIComponent(reference)}/hotel-cancel`,
          { itemId: offer.itemId }
        );
        if (!result.ok) return result.error || CLIENT_CANCEL_REFUSED;
        router.refresh();
      }}
    />
  );
}
