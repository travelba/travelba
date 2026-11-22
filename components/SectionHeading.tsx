type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  tone?: "default" | "inverse";
};

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  tone = "default",
}: SectionHeadingProps) {
  const inverse = tone === "inverse";
  const alignment = align === "center" ? "mx-auto items-center text-center" : "items-start text-left";

  return (
    <div className={`flex max-w-3xl flex-col ${alignment}`}>
      <span className={`lux-kicker ${inverse ? "lux-kicker-inverse" : ""}`}>{eyebrow}</span>
      <h2
        className={`mt-5 font-display text-[clamp(2.15rem,4vw,3.5rem)] leading-[1.05] ${
          inverse ? "text-[#F7F3EB]" : "text-[#1A1714]"
        }`}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`mt-5 max-w-xl text-[15px] leading-[1.75] ${
            inverse ? "text-[#F7F3EB]/78" : "text-muted"
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
