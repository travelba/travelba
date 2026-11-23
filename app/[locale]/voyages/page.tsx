import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { PageHero } from "@/components/site/PageHero";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { SIGNATURE_SLOTS, signatureSlug } from "@/lib/site-offers";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Voyages" });
  return publicPageMeta(locale, "/voyages", t("metaTitle"), t("metaDescription"));
}

export default async function VoyagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Voyages");
  const tServices = await getTranslations("Services");
  const fields = ["destination", "duration", "season", "pace"] as const;

  return (
    <>
      <Header />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <PageHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="font-display text-[2rem] leading-none text-[#1A1714]">{t("methodTitle")}</h2>
            </div>
            <ol className="grid gap-8 sm:grid-cols-2 lg:col-span-8">
              {(["destination", "rhythm", "days", "adjust"] as const).map((step, index) => (
                <li key={step} className="border-t border-[#C5A880] pt-4">
                  <p className="font-display text-3xl text-[#5C4824]">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 font-display text-[1.6rem] leading-none">{t(`method.${step}.title`)}</h3>
                  <p className="mt-3 text-sm leading-[1.7] text-muted">{t(`method.${step}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05]">{t("catalogueTitle")}</h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.7] text-muted">{t("catalogueText")}</p>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2">
              {SIGNATURE_SLOTS.map((slot) => (
                <li key={slot}>
                  <Link
                    href={`/voyages/${signatureSlug(slot)}`}
                    className="group flex h-full flex-col border border-[#1A1714]/15 bg-[#FBF8F3] p-6 transition-colors hover:border-[#5C4824]"
                  >
                    <p className="font-display text-4xl text-[#5C4824]">{slot}</p>
                    <h3 className="mt-4 font-display text-[1.8rem] leading-none">
                      {t("cardTitle", { slot })}
                    </h3>
                    <dl className="mt-6 space-y-3 text-sm">
                      {fields.map((field) => (
                        <div key={field} className="flex items-baseline justify-between gap-4 border-t border-[#1A1714]/10 pt-3">
                          <dt className="text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">{t(`fields.${field}`)}</dt>
                          <dd className="text-[#1A1714]">{t("blank")}</dd>
                        </div>
                      ))}
                    </dl>
                    <span className="mt-6 text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
                      {t("openItinerary")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <QuoteBlock defaultService={tServices("bespoke.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
