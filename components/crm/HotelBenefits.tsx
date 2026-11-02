import { Icon } from "@/components/crm/icons";
import { benefitLine, type BenefitTone } from "@/lib/crm/hotel-gallery";

const TONE_ICON: Record<BenefitTone, string> = {
  upgrade: "local_activity",
  breakfast: "coffee",
  credit: "payments",
  schedule: "sunrise",
  night: "moon",
  gift: "verified",
};

/** Avantages ou inclus, en bloc. Le titre reste « Inclus » hors Little Emperors. */
export function HotelBenefits({ lines, title = "Vos avantages exclusifs" }: { lines: string[]; title?: string }) {
  const benefits = lines.map(benefitLine).filter((line) => line.title);
  if (!benefits.length) return null;
  return (
    <section className="rounded-2xl bg-[#0B192C] px-3.5 py-3 text-[#faf9f6]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">{title}</p>
      <ul className="mt-2.5 space-y-2.5">
        {benefits.map((benefit) => (
          <li key={`${benefit.title}-${benefit.note}`} className="flex items-start gap-2.5">
            <Icon name={TONE_ICON[benefit.tone]} className="mt-0.5 h-4 w-4 shrink-0 text-[#C5A880]" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-snug">{benefit.title}</span>
              {benefit.note ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{benefit.note}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
