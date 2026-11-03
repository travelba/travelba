import { publicRobots } from "@/lib/crm/public-catalogue";
import { siteConfig } from "@/lib/site";

export default function robots() {
  return publicRobots(`${siteConfig.url}/sitemap.xml`, siteConfig.url);
}
