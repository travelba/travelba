import { siteConfig } from "@/lib/site";
import { routing } from "@/i18n/routing";

const PATHS = ["", "/legal", "/classement", "/guide"] as const;

export default function sitemap() {
  const lastModified = new Date();

  return routing.locales.flatMap((locale) =>
    PATHS.map((path) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      lastModified,
      changeFrequency: path === "" || path === "/classement" || path === "/guide" ? ("weekly" as const) : ("yearly" as const),
      priority: path === "" ? 1 : path === "/legal" ? 0.4 : 0.6,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${siteConfig.url}/${l}${path}`])
        ),
      },
    }))
  );
}
