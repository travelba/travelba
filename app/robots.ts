import { siteConfig } from "@/lib/site";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/e/", "/k/", "/v/", "/exemple", "/apercu", "/admin", "/mon-compte", "/connexion", "/auth", "/preview-refonte"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
