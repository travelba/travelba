"use client";

import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { postJson } from "@/lib/crm/client-fetch";
import {
  CLIENT_CANCEL_ADVISOR,
  CLIENT_CANCEL_NON_REFUNDABLE,
  CLIENT_CANCEL_REFUSED,
  clientCancelFreeLine,
  clientCancelQuestion,
} from "@/lib/crm/le-cancel-copy";

/** Bouton d’annulation gratuite, ou la phrase conseiller. `free` vient du serveur. */
export function HotelFreeCancel({
  reference,
  free,
  itemId,
  hotelName,
  stayLabel,
  untilLabel,
  tone,
}: {
  reference: string;
  free: boolean;
  itemId: string;
  hotelName: string;
  stayLabel: string;
  untilLabel: string;
  tone?: "non_refundable";
}) {
  const router = useRouter();
  if (!free) {
    return (
      <p className="text-sm text-muted">
        {tone === "non_refundable" ? CLIENT_CANCEL_NON_REFUNDABLE : CLIENT_CANCEL_ADVISOR}
      </p>
    );
  }
  const question = clientCancelQuestion({ hotelName, stayLabel, untilLabel });
  return (
    <div className="space-y-2">
    <p className="text-sm text-muted">{clientCancelFreeLine(untilLabel)}</p>
    <ConfirmAction
      label="Annuler cette réservation"
      confirmLabel="Confirmer l’annulation"
      cancelLabel="Garder la réservation"
      question={question}
      hint="Aucun frais. L’annulation part directement chez l’hôtel."
      tone="danger"
      ariaLabel={`Annuler ${hotelName}`}
      wrapperClassName="pt-1"
      onConfirm={async () => {
        const result = await postJson<{ ok?: boolean }>(
          `/api/client/bookings/${encodeURIComponent(reference)}/hotel-cancel`,
          { itemId }
        );
        if (!result.ok) return result.error || CLIENT_CANCEL_REFUSED;
        router.refresh();
      }}
    />
    </div>
  );
}
