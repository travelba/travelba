import { BusyBar } from "@/components/crm/BusyBar";

/** Écran d’attente. Le corps ne reste pas vide, et la phrase dit l’étape en cours. */
export function HotelBookingWait({ phase = "hotel" }: { phase?: "hotel" | "stay" }) {
  const title = phase === "stay" ? "Nous préparons votre séjour…" : "Confirmation auprès de l’hôtel…";
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center" data-hotel-wait="1" data-hotel-wait-phase={phase}>
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#0B192C] border-t-[#C5A880]" aria-hidden="true" />
      <h1 className="h-serif mt-6 text-[1.35rem] leading-snug h-ink">{title}</h1>
      <div className="mt-6 w-full max-w-[16rem]">
        <BusyBar active label={title} />
      </div>
      <p className="mt-6 text-sm leading-relaxed h-muted">Ne fermez pas cette page.</p>
    </div>
  );
}
