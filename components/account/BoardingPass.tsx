import type { FlightPass } from "@/lib/crm/carnet";
import { AddToPhoneCalendar } from "@/components/account/AddToPhoneCalendar";

export function BoardingPass({
  pass,
  calendarHref,
  googleHref = null,
}: {
  pass: FlightPass;
  calendarHref: string;
  googleHref?: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-[#0B192C] text-white shadow-[0_16px_36px_rgba(11,25,44,0.28)]">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">
            Carte d’embarquement
          </p>
          <p className="mt-1 truncate font-display text-xl font-bold">
            {pass.airline || "Vol"}
          </p>
          {pass.number ? (
            <p className="mt-1 font-display text-lg font-semibold tracking-wide text-[#C5A880]">
              {pass.number}
            </p>
          ) : null}
          {pass.airports ? <p className="mt-2 text-sm text-white/80">{pass.airports}</p> : null}
        </div>
        {pass.time ? (
          <p className="shrink-0 text-right">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
              Heure
            </span>
            <span className="font-display text-2xl font-bold">{pass.time}</span>
          </p>
        ) : null}
      </div>
      <div className="border-t border-dashed border-white/20 px-4 py-3">
        <AddToPhoneCalendar
          href={calendarHref}
          googleHref={googleHref}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C]"
        >
          Ajouter au calendrier
        </AddToPhoneCalendar>
      </div>
    </section>
  );
}
