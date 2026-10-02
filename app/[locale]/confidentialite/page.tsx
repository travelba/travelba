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
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return { title: `${t("title")} — ${siteConfig.name}` };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PrivacyContent />;
}

function PrivacyContent() {
  const t = useTranslations("Privacy");
  const tCommon = useTranslations("Common");
  const email = siteConfig.contactEmail;
  const sections = [
    "controller",
    "data",
    "use",
    "app",
    "share",
    "rights",
    "retention",
    "cookies",
  ] as const;

  return (
    <main className="relative mx-auto min-h-screen max-w-3xl px-5 py-20 sm:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {tCommon("backHome")}
      </Link>

      <h1 className="mt-8 font-display text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-4 leading-relaxed text-muted">{t("intro")}</p>

      {sections.map((key) => (
        <section key={key} className="mt-10">
          <h2 className="font-display text-xl font-semibold">{t(`${key}Title`)}</h2>
          <p className="mt-3 leading-relaxed text-muted">{t(`${key}Text`, { email })}</p>
        </section>
      ))}
    </main>
  );
}
