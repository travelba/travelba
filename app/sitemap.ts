import { siteConfig } from "@/lib/site";
import { SIGNATURE_SLOTS, signatureSlug } from "@/lib/site-offers";
import { routing } from "@/i18n/routing";

const PATHS = [
  "",
  "/legal",
  "/voyages",
  ...SIGNATURE_SLOTS.map((slot) => `/voyages/${signatureSlug(slot)}`),
  "/application",
  "/evenements",
  "/famille",
] as const;

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
