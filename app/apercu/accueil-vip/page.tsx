import { notFound } from "next/navigation";
import { AccueilVipPreview } from "@/components/admin/AccueilVipPreview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu accueil VIP — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function AccueilVipPreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  return <AccueilVipPreview />;
}
