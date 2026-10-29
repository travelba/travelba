"use client";

import { BookingIngest } from "@/components/crm/BookingIngest";

/**
 * Nouveau dossier : une seule zone de dépôt. « Saisir à la main » y ouvre une carte vide ;
 * « Créer le dossier » est l’unique geste de création, le dossier reste En préparation.
 */
export function NewBookingForm({ aiConfigured }: { aiConfigured: boolean }) {
  return (
    <BookingIngest
      role="admin"
      mode="create"
      ingestUrl="/api/admin/bookings/ingest"
      saveUrl="/api/admin/bookings/from-ingest"
      aiConfigured={aiConfigured}
      redirectTo={(booking) => `/admin/reservations/${booking.id}`}
    />
  );
}
