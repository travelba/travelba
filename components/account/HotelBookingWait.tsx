"use client";

import { HotelWait } from "@/components/account/HotelWait";

/** Écran d’attente pendant que la réservation part. Rien n’est relancé ici. */
export function HotelBookingWait({ phase = "hotel" }: { phase?: "hotel" | "stay" }) {
  const place = phase === "stay" ? "Nous préparons votre séjour" : "Confirmation auprès de l’hôtel";
  return (
    <div data-hotel-wait-phase={phase}>
      <HotelWait place={place} hold />
    </div>
  );
}
