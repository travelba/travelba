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
    <main className="relative mx-auto min-h-screen max-w-3xl px-5 py-20 sm:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {tCommon("backHome")}
      </Link>

      <h1 className="mt-8 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 leading-relaxed text-muted">{t("intro")}</p>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold">
          {t("companyTitle")}
        </h2>
        <dl className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="text-sm font-medium text-foreground sm:text-right">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">
          {t("hostingTitle")}
        </h2>
        <p className="mt-3 leading-relaxed text-muted">{t("hostingText")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">{t("ipTitle")}</h2>
        <p className="mt-3 leading-relaxed text-muted">{t("ipText")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">{t("dataTitle")}</h2>
        <p className="mt-3 leading-relaxed text-muted">
          {t("dataText", { email: siteConfig.contactEmail })}
        </p>
      </section>
    </main>
  );
}
