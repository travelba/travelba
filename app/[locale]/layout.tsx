import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { brandShareImages, siteConfig } from "@/lib/site";
import { HtmlLang } from "@/components/HtmlLang";

/** Serif de la vitrine seulement. Le CRM garde Plus Jakarta. */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "500",
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
  adjustFontFallback: true,
  preload: true,
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  return {
    metadataBase: new URL(siteConfig.url),
    title: t("title"),
    description: t("description"),
    robots: { index: true, follow: true },
    openGraph: {
      title: t("title"),
      description: t("description"),
      siteName: siteConfig.name,
      locale,
      type: "website",
      url: locale === "en" ? "/en" : "/fr",
      images: brandShareImages(siteConfig.name),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: brandShareImages(siteConfig.name).map((image) => image.url),
    },
    alternates: {
      canonical: locale === "en" ? "/en" : "/fr",
      languages: {
        fr: "/fr",
        en: "/en",
        "x-default": "/fr",
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const t = await getTranslations("Common");

  return (
    <NextIntlClientProvider>
      <HtmlLang locale={locale} />
      <div lang={locale} className={`vitrine ${cormorant.variable}`}>
        <a href="#contenu" className="vitrine-skip">
          {t("skip")}
        </a>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
