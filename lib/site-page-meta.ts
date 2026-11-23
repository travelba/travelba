import type { Metadata } from "next";

export function publicPageMeta(locale: string, path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: {
        fr: `/fr${path}`,
        en: `/en${path}`,
        "x-default": `/fr${path}`,
      },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}${path}`,
      type: "website",
    },
  };
}
