import { siteConfig } from "@/lib/site";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/admin",
        "/mon-compte",
        "/connexion",
        "/auth",
        "/demo",
        "/devis",
        "/d/",
        "/v/",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
