import { BusyBar } from "@/components/crm/BusyBar";

/** Écran d’attente pendant que la réservation est posée. Le corps ne reste pas vide. */
export function HotelBookingWait() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center" data-hotel-wait="1">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#0B192C] border-t-[#C5A880]" aria-hidden="true" />
      <h1 className="h-serif mt-6 text-[1.35rem] leading-snug h-ink">Réservation en cours, merci de patienter…</h1>
      <div className="mt-6 w-full max-w-[16rem]">
        <BusyBar active label="Réservation en cours" />
      </div>
      <p className="mt-6 text-sm leading-relaxed h-muted">Ne fermez pas cette page.</p>
    </div>
  );
}
