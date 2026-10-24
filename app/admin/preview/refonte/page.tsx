import { RefonteHome } from "@/components/admin/refonte/RefonteHome";
import { loadRefonteSnapshot } from "@/lib/crm/refonte-load";
import { siteConfig } from "@/lib/site";

export const metadata = { title: { absolute: `Ce qui a besoin de moi — ${siteConfig.shortName}` } };

export default async function RefonteHomePage() {
  const snapshot = await loadRefonteSnapshot();
  return <RefonteHome snapshot={snapshot} />;
}
