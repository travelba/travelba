import { NotFoundPanel } from "@/components/crm/ErrorPanel";
import { siteConfig } from "@/lib/site";

export const metadata = { title: { absolute: `Page introuvable — ${siteConfig.shortName}` } };

export default function AdminNotFound() {
  return <NotFoundPanel homeHref="/admin" homeLabel="Tableau de bord" />;
}
