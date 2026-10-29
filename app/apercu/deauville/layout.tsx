import { notFound } from "next/navigation";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu Deauville — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function DeauvillePreviewLayout({ children }: { children: React.ReactNode }) {
  if (!exampleSessionEnabled()) notFound();
  return children;
}
