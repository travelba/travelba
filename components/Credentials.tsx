import { useTranslations } from "next-intl";
import { Plane, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";

export function Credentials() {
  const t = useTranslations("Credentials");

  const badges = [
    { icon: Plane, title: t("iataTitle"), desc: t("iataDesc") },
    { icon: ShieldCheck, title: t("apstTitle"), desc: t("apstDesc") },
  ];

  return (
    <section id="accreditations" className="px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal className="glass rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col items-center gap-7 lg:flex-row lg:justify-between lg:gap-10">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">
                <span className="h-px w-6 bg-accent-2" />
                {t("eyebrow")}
              </span>
              <p className="mt-2 max-w-sm text-sm text-muted">
                {t("reassurance")}
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:w-auto">
              {badges.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-5 py-4"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-2/20 to-accent/20 text-accent">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="font-display font-semibold">{title}</div>
                    <div className="mt-0.5 text-xs text-muted">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
