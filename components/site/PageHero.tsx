export function PageHero({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <header className="border-b border-[#1A1714]/10 px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20">
      <div className="mx-auto max-w-7xl">
        <p className="lux-kicker">{eyebrow}</p>
        <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.6rem,6vw,5rem)] leading-[0.98] text-[#1A1714]">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{lede}</p>
      </div>
    </header>
  );
}
