import type { Metadata } from "next";
import { HotelBookingWait } from "@/components/account/HotelBookingWait";
import { StayConfirmedNote } from "@/components/account/StayConfirmedNote";
import { clientCancellationSentence } from "@/lib/crm/le-self-book";
import { formatMoney } from "@/lib/crm/money";

export const metadata: Metadata = {
  title: "Réservation — aperçu",
  robots: { index: false, follow: false },
};

const SENTENCE = clientCancellationSentence({
  deadline: "2026-11-26T18:00:00.000000Z",
  policy: "Free cancellation before 18:00 on 26 November 2026 after which a charge of EUR 162.74 will be incurred.",
  free: true,
});

export default async function ReservationPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const { etat } = await searchParams;
  if (etat === "confirmee") {
    return (
      <main className="account-app mx-auto min-h-screen w-full max-w-[480px] px-4 py-6">
        <div className="space-y-4">
          <StayConfirmedNote />
          <p className="text-sm font-semibold text-[var(--admin-navy)]">← Réservations</p>
          <article className="space-y-3 rounded-2xl bg-[#0B192C] px-5 py-6 text-[#f7f4ee]">
            <p className="text-[13px] font-semibold text-[#C5A880]">Séjour</p>
            <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">Hotel Indigo Bordeaux Centre Chartrons by IHG</h1>
            <p className="text-sm text-white/75">Bordeaux</p>
            <p className="text-sm text-white/75">27 novembre 2026 — 28 novembre 2026</p>
          </article>
          <article className="space-y-2 rounded-2xl bg-white px-4 py-4 text-[15px] text-[#1a1a1a] shadow-sm">
            <p className="font-semibold">1 Queen Standard</p>
            <p className="text-2xl font-semibold">{formatMoney(142.74, "EUR")}</p>
            <p className="text-sm leading-relaxed text-[#6d675f]">{SENTENCE}</p>
          </article>
        </div>
      </main>
    );
  }
  return (
    <main className="hotel-theme mx-auto min-h-screen w-full max-w-[480px]">
      <header className="grid h-14 grid-cols-[2.75rem_1fr_2.75rem] items-center bg-white">
        <span className="text-center text-[#1a1a1a]">‹</span>
        <p className="h-serif text-center text-[17px] font-semibold">Réservation</p>
        <span />
      </header>
      <HotelBookingWait />
    </main>
  );
}
