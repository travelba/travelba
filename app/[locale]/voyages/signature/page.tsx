import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { VoyageNav } from "@/components/voyages/VoyageNav";
import { Link } from "@/i18n/navigation";
import { publicPageMeta } from "@/lib/site-page-meta";
import { SIGNATURE_SLOTS, signatureSlug } from "@/lib/site-offers";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Voyages" });
  return publicPageMeta(locale, "/voyages/signature", t("metaTitle"), t("metaDescription"));
}

export default async function SignatureIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Voyages");
  const fields = ["destination", "duration", "season", "pace"] as const;

  return (
    <>
      <Header />
      <VoyageNav />
      <main id="contenu" tabIndex={-1} className="outline-none">
        <header className="px-5 pb-12 pt-16 sm:px-8 sm:pt-20">
          <div className="mx-auto max-w-7xl">
            <p className="lux-kicker">{t("eyebrow")}</p>
            <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.6rem,5vw,4.6rem)] leading-[0.98]">{t("catalogueTitle")}</h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#3C3833]">{t("catalogueText")}</p>
          </div>
        </header>
        <ul className="mx-auto grid max-w-7xl gap-6 px-5 pb-20 sm:grid-cols-2 sm:px-8">
          {SIGNATURE_SLOTS.map((slot) => (
            <li key={slot}>
              <Link href={`/voyages/signature/${signatureSlug(slot)}`} className="flex h-full flex-col border border-[#1A1714]/15 bg-[#FBF8F3] p-6 hover:border-[#5C4824]">
                <p className="font-display text-4xl text-[#5C4824]">{slot}</p>
                <h2 className="mt-4 font-display text-[1.8rem] leading-none">{t("cardTitle", { slot })}</h2>
                <dl className="mt-6 space-y-3 text-sm">
                  {fields.map((field) => (
                    <div key={field} className="flex justify-between gap-4 border-t border-[#1A1714]/10 pt-3">
                      <dt className="text-[11px] uppercase tracking-[0.16em] text-[#5C4824]">{t(`fields.${field}`)}</dt>
                      <dd>{t("blank")}</dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
