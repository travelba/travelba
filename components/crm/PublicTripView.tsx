import { BookingHero } from "@/components/crm/BookingHero";
import { ReservationFiles } from "@/components/crm/ReservationFiles";
import { BrandMark } from "@/components/crm/ui";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { tripHeadline, tripPlaceLine } from "@/lib/crm/carnet";
import { formatDateFr } from "@/lib/crm/money";
import { attachmentPreviews } from "@/lib/crm/preview-files";
import { siteConfig } from "@/lib/site";
import type { CrmBooking, CrmBookingDocument, CrmBookingItem } from "@/lib/crm/types";

/** Page du voyage : itinéraire et documents. Pas de compte, pas de facturation. */
export function PublicTripView({
  booking,
  items,
  docs,
  partage = null,
  calendarBase,
}: {
  booking: CrmBooking;
  items: CrmBookingItem[];
  docs: CrmBookingDocument[];
  partage?: string | null;
  calendarBase?: string | null;
}) {
  const shown = items.map((item) => ({ ...item, amount: null }));
  const headline = tripHeadline(booking.title, booking.destination);
  const placeLine = tripPlaceLine(booking.title, booking.destination);
  const attachments = attachmentPreviews(docs, shown, booking.reference).map((file) => ({
    ...file,
    partage,
  }));
  const agenda = calendarBase === undefined ? (partage ? `/v/${partage}/agenda.ics` : null) : calendarBase;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f4f1ea] px-4 py-6 text-[#0B192C]">
      <header className="mb-4">
        <BrandMark href={siteConfig.url} compact />
      </header>

      <BookingHero
        booking={booking}
        items={items}
        partage={partage}
        priority
        className="rounded-2xl shadow-[0_16px_36px_rgba(11,31,58,0.25)]"
      >
        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex justify-end">
            <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
              {booking.reference}
            </span>
          </div>
          <div>
            <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">{headline}</h1>
            {placeLine ? <p className="text-sm text-white/75">{placeLine}</p> : null}
            <p className="text-sm text-white/75">
              {formatDateFr(booking.start_date)} — {formatDateFr(booking.end_date)}
            </p>
          </div>
        </div>
      </BookingHero>

      {booking.notes_client ? (
        <p className="aura-card mt-5 rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed">
          {booking.notes_client}
        </p>
      ) : null}

      <div className="mt-5">
        <CarnetItinerary
          booking={booking}
          items={shown}
          docs={docs}
          partage={partage}
          calendarBase={agenda}
        />
      </div>

      <div className="mt-5">
        <ReservationFiles
          attachments={attachments}
          showPassports={false}
          attachmentsLabel="Documents du voyage"
          emptyLabel="Aucun document sur ce voyage."
        />
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Page du voyage, sans connexion. Préparée par Travel Business Agency.
      </p>
    </main>
  );
}
