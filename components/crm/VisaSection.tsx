"use client";

import { VisaJourney } from "@/components/crm/VisaJourney";
import { VisaRunPanel } from "@/components/admin/VisaRunPanel";
import { journeyStarted, readEstaAnswers, type ClientVisaStep, type EstaAnswers } from "@/lib/crm/visa-flow";
import type { FrenchPassportTrip } from "@/lib/crm/visa-trip";
import type { VisaCorridor } from "@/lib/crm/visa-fees";
import type { CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";

type VisaRequest = {
  country: string;
  step?: ClientVisaStep | null;
  status?: string | null;
  accepted_at?: string | null;
  answers?: Partial<EstaAnswers> | null;
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
  showReceived = true,
  proposed = false,
  settled = [],
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
  showReceived?: boolean;
  /** Vrai : l’agence a activé Visa dans Services proposés. */
  proposed?: boolean;
  /** Pays dont l’autorisation couvre déjà le séjour. */
  settled?: string[];
}) {
  if (!trip.hasFlight) return null;
  return (
    <div className={variant === "admin" ? "space-y-4" : undefined}>
      {variant === "admin" ? (
        <p className="text-[10px] font-bold tracking-[0.14em] text-[var(--admin-gold)] uppercase">Visa</p>
      ) : null}
      {variant === "admin"
        ? trip.entries
            .filter((entry): entry is typeof entry & { iso: VisaCorridor } =>
              entry.iso === "IL" || entry.iso === "US" || entry.iso === "GB"
            )
            .map((entry) => {
              const request = requests.find((row) => row.country === entry.iso);
              if (!journeyStarted(request)) return null;
              return (
                <VisaRunPanel
                  key={`${entry.iso}-${request?.step || ""}-${request?.accepted_at || ""}`}
                  bookingId={bookingId}
                  country={entry.iso}
                  step={request?.step}
                  acceptedAt={request?.accepted_at}
                  initialAnswers={readEstaAnswers(request?.answers)}
                  pliantReady={pliantReady}
                />
              );
            })
        : null}
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
        showReceived={showReceived}
        proposed={proposed}
        settled={settled}
      />
    </div>
  );
}
