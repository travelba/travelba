"use client";

import { VisaJourney } from "@/components/crm/VisaJourney";
import type { ClientVisaStep } from "@/lib/crm/visa-flow";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

type VisaRequest = {
  country: string;
  step?: ClientVisaStep | null;
  status?: string | null;
  accepted_at?: string | null;
};

export function VisaSection({
  variant,
  bookingId,
  reference,
  trip,
  requests,
  travelers,
  documents,
  visaBooked,
  pliantReady = false,
}: {
  variant: "admin" | "client";
  bookingId: string;
  reference: string;
  trip: FrenchPassportTrip;
  requests: VisaRequest[];
  travelers: CrmBookingTraveler[];
  documents: CrmTravelDocument[];
  visaBooked: boolean;
  /** Vrai seulement si les clés Pliant sont présentes. Sinon le paiement reste un geste explicite. */
  pliantReady?: boolean;
}) {
  if (!trip.hasFlight) return null;
  return (
    <div className={variant === "admin" ? "space-y-4" : undefined}>
      {variant === "admin" ? (
        <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--admin-gold)] uppercase">Visa</p>
      ) : null}
      <VisaJourney
        variant={variant}
        bookingId={bookingId}
        reference={reference}
        trip={trip}
        requests={requests}
        travelers={travelers}
        documents={documents}
        visaBooked={visaBooked}
        pliantReady={pliantReady}
      />
    </div>
  );
}
