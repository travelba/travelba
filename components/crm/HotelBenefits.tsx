import { Icon } from "@/components/crm/icons";
import { benefitLine, type BenefitTone } from "@/lib/crm/hotel-gallery";

const TONE_ICON: Record<BenefitTone, string> = {
  upgrade: "local_activity",
  breakfast: "coffee",
  credit: "payments",
  schedule: "sunrise",
  night: "moon",
  gift: "verified",
  transfer: "airport_shuttle",
};

/** Avantages ou inclus, en bloc. Le titre reste « Inclus » hors Little Emperors. `row` aligne les mêmes lignes. */
export function HotelBenefits({
  lines,
  title = "Vos avantages exclusifs",
  layout = "stack",
}: {
  lines: string[];
  title?: string;
  layout?: "stack" | "row" | "grid" | "icons";
}) {
  const benefits = lines.map(benefitLine).filter((line) => line.title);
  if (!benefits.length) return null;
  if (layout === "grid") {
    return (
      <ul className="grid grid-cols-1 gap-y-0" data-hotel-benefit-grid="1">
        {benefits.map((benefit) => {
          const marked = benefit.title.endsWith("*");
          const label = marked ? benefit.title.slice(0, -1).trim() : benefit.title;
          return (
            <li key={`${benefit.title}-${benefit.note}`} className="flex items-center gap-2 py-px">
              <Icon name={TONE_ICON[benefit.tone]} className="h-4 w-4 shrink-0 text-[#C5A880]" />
              <span className="text-[13px] font-semibold leading-tight text-[#f7f4ee]">
                {label}
                {marked ? <span className="text-[#C5A880]">*</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (layout === "icons") {
    return (
      <section className="flex min-h-11 items-center gap-2 rounded-xl bg-[#0B192C] px-3 py-2 text-[#faf9f6]" data-hotel-benefit-icons="1">
        <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {benefits.map((benefit) => (
            <li key={`${benefit.title}-${benefit.note}`} className="grid h-7 w-7 shrink-0 place-items-center" title={benefit.title}>
              <Icon name={TONE_ICON[benefit.tone]} className="h-4 w-4 text-[#C5A880]" />
              <span className="sr-only">{benefit.title}</span>
            </li>
          ))}
        </ul>
        <p className="shrink-0 text-[12px] font-semibold text-[#C5A880]">{title}</p>
      </section>
    );
  }
  if (layout === "row") {
    return (
      <section className="rounded-2xl bg-[#0B192C] px-3.5 py-3 text-[#faf9f6]" data-hotel-benefit-row="1">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">{title}</p>
        <ul className="mt-2.5 flex gap-3 overflow-x-auto">
          {benefits.map((benefit) => (
            <li key={`${benefit.title}-${benefit.note}`} className="flex w-40 shrink-0 items-start gap-2">
              <Icon name={TONE_ICON[benefit.tone]} className="mt-0.5 h-4 w-4 shrink-0 text-[#C5A880]" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug">{benefit.title}</span>
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
