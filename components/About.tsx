import { useTranslations } from "next-intl";
import { MapPin, Clock, Sparkles } from "lucide-react";
import { Reveal } from "./Reveal";

export function About() {
  const t = useTranslations("About");

  const facts = [
    { icon: MapPin, label: t("fact1Label"), value: t("fact1Value") },
    { icon: Clock, label: t("fact2Label"), value: t("fact2Value") },
    { icon: Sparkles, label: t("fact3Label"), value: t("fact3Value") },
  ];

  return (
    <section id="about" className="relative px-5 py-24 sm:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">
            <span className="h-px w-6 bg-accent-2" />
            {t("eyebrow")}
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted">{t("p1")}</p>
          <p className="mt-4 text-base leading-relaxed text-muted">{t("p2")}</p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="glass rounded-2xl p-7">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              {t("factsTitle")}
            </h3>
            <ul className="mt-5 space-y-5">
              {facts.map(({ icon: Icon, label, value }) => (
                <li key={label} className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-accent">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted">
                      {label}
                    </div>
                    <div className="mt-0.5 font-medium">{value}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
