import { siteConfig } from "@/lib/site";
import { SIGNATURE_SLOTS, signatureSlug } from "@/lib/site-offers";
import { DESTINATIONS, THEMES } from "@/lib/voyages/content";
import { routing } from "@/i18n/routing";

const PATHS = [
  "",
  "/legal",
  "/voyages",
  "/voyages/destinations",
  ...DESTINATIONS.map((item) => `/voyages/destinations/${item.slug}`),
  "/voyages/envies",
  ...THEMES.map((item) => `/voyages/envies/${item.id}`),
  "/voyages/signature",
  ...SIGNATURE_SLOTS.map((slot) => `/voyages/signature/${signatureSlug(slot)}`),
  "/application",
  "/evenements",
  "/famille",
];

export default function sitemap() {
  const lastModified = new Date();

  return routing.locales.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      lastModified,
      changeFrequency: path === "" ? ("weekly" as const) : ("yearly" as const),
      priority: path === "" ? 1 : 0.4,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${siteConfig.url}/${l}${path}`])
        ),
      },
    }))
  );
}
