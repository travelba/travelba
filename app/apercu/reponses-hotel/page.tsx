import { notFound } from "next/navigation";
import { HotelReplyPreview } from "@/components/admin/HotelReplyPreview";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function HotelReplyPreviewPage() {
  if (!exampleSessionEnabled()) notFound();
  return <HotelReplyPreview />;
}
