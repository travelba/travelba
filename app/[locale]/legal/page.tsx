import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return { title: `${t("title")} — ${siteConfig.name}` };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalContent />;
}

function LegalContent() {
  const t = useTranslations("Legal");
  const tCommon = useTranslations("Common");
  const { legal, address } = siteConfig;

  const rows: { label: string; value: string }[] = [
    { label: t("fields.legalName"), value: legal.legalName },
    { label: t("fields.legalForm"), value: legal.legalForm },
    { label: t("fields.capital"), value: legal.capital },
    { label: t("fields.address"), value: address.full },
    { label: t("fields.president"), value: legal.president },
    { label: t("fields.siren"), value: legal.siren },
    { label: t("fields.siret"), value: legal.siret },
    { label: t("fields.rcs"), value: legal.rcs },
    { label: t("fields.vat"), value: legal.vat },
    { label: t("fields.ape"), value: legal.ape },
    { label: t("fields.accreditation"), value: legal.accreditation },
    { label: t("fields.garantie"), value: legal.garantieFinanciere },
    { label: t("fields.email"), value: siteConfig.contactEmail },
  ];

  return (
    <main id="contenu" tabIndex={-1} className="relative mx-auto min-h-screen max-w-3xl px-5 py-16 outline-none sm:px-8 sm:py-20">
      <Link
        href="/"
        className="lux-line inline-flex items-center gap-2 text-sm text-[#4E4942] hover:text-[#1A1714]"
      >
        <ArrowLeft className="h-4 w-4" />
        {tCommon("backHome")}
      </Link>

      <h1 className="mt-10 font-display text-[clamp(2.4rem,5vw,3.5rem)] leading-[1.05] text-[#1A1714]">
        {t("title")}
      </h1>
      <p className="mt-5 leading-[1.75] text-muted">{t("intro")}</p>

      <section className="mt-12">
        <h2 className="font-display text-[1.85rem] leading-none text-[#1A1714]">
          {t("companyTitle")}
        </h2>
        <dl className="mt-6 border-t border-[#1A1714]/15">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 border-b border-[#1A1714]/10 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#5C4824]">
                {row.label}
              </dt>
              <dd className="text-sm text-[#1A1714] sm:max-w-md sm:text-right">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[1.85rem] leading-none text-[#1A1714]">
          {t("hostingTitle")}
        </h2>
        <p className="mt-4 leading-[1.75] text-muted">{t("hostingText")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[1.85rem] leading-none text-[#1A1714]">{t("ipTitle")}</h2>
        <p className="mt-4 leading-[1.75] text-muted">{t("ipText")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-[1.85rem] leading-none text-[#1A1714]">{t("dataTitle")}</h2>
        <p className="mt-4 leading-[1.75] text-muted">
          {t("dataText", { email: siteConfig.contactEmail })}
        </p>
      </section>
    </main>
  );
}
