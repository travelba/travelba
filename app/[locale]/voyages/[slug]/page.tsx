import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { QuoteBlock } from "@/components/site/QuoteBlock";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { SIGNATURE_SLOTS, signatureSlotFromSlug, signatureSlug } from "@/lib/site-offers";

export function generateStaticParams() {
  return SIGNATURE_SLOTS.map((slot) => ({ slug: signatureSlug(slot) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const slot = signatureSlotFromSlug(slug);
  const t = await getTranslations({ locale, namespace: "VoyageDetail" });
  const title = slot ? t("metaTitle", { slot }) : t("missingTitle");
  return publicPageMeta(locale, `/voyages/${slug}`, title, t("metaDescription"));
}

export default async function VoyageDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const slot = signatureSlotFromSlug(slug);
  if (!slot) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("VoyageDetail");
  const tServices = await getTranslations("Services");
  const days = ["1", "2", "3"] as const;
  const facts = ["destination", "duration", "season", "pace", "forWhom"] as const;

  return (
    <>
      <Header />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <header className="border-b border-[#1A1714]/10 px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
          <div className="mx-auto max-w-7xl">
            <Link href="/voyages" className="lux-line text-[11px] font-medium uppercase tracking-[0.2em] text-[#5C4824]">
              {t("back")}
            </Link>
            <p className="lux-kicker mt-8">{t("eyebrow", { slot })}</p>
            <h1 className="mt-5 max-w-4xl font-display text-[clamp(2.6rem,6vw,4.8rem)] leading-[0.98]">
              {t("title", { slot })}
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{t("lede")}</p>
            <dl className="mt-12 grid gap-6 border-t border-[#1A1714]/15 pt-8 sm:grid-cols-2 lg:grid-cols-5">
              {facts.map((fact) => (
                <div key={fact}>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">{t(`facts.${fact}`)}</dt>
                  <dd className="mt-2 font-display text-2xl leading-tight">{t("blank")}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <section className="px-5 py-16 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="font-display text-[2rem] leading-none">{t("daysTitle")}</h2>
              <p className="mt-4 text-sm leading-[1.7] text-muted">{t("daysText")}</p>
            </div>
            <ol className="lg:col-span-8">
              {days.map((day) => (
                <li key={day} className="grid gap-3 border-t border-[#1A1714]/15 py-6 sm:grid-cols-[5rem_1fr]">
                  <p className="font-display text-3xl text-[#5C4824]">{t("day", { day })}</p>
                  <div>
                    <h3 className="font-display text-[1.6rem] leading-none">{t("blank")}</h3>
                    <p className="mt-3 text-sm leading-[1.7] text-muted">{t("blank")}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="border-t border-[#1A1714]/10 px-5 py-16 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-[1.8rem] leading-none">{t("includedTitle")}</h2>
              <p className="mt-4 text-sm leading-[1.7] text-muted">{t("blank")}</p>
            </div>
            <div>
              <h2 className="font-display text-[1.8rem] leading-none">{t("bespokeTitle")}</h2>
              <p className="mt-4 text-sm leading-[1.7] text-muted">{t("bespokeText")}</p>
            </div>
          </div>
        </section>
        <QuoteBlock defaultService={tServices("bespoke.title")} />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
