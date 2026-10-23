import { notFound } from "next/navigation";
import { AccountChrome } from "@/components/account/AccountChrome";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Aperçu Hôtels", robots: { index: false, follow: false } };

/** Aperçu local : bouton visible, accès fermé. N’écrit rien, ne change pas le réglage. */
export default function HotelPreviewLayout({ children }: { children: React.ReactNode }) {
  if (!exampleSessionEnabled()) notFound();
  return (
    <AccountChrome customerName="Camille Morel" initials="CM" needsPhone={false} basePath="/apercu/membres" preview hotels>
      {children}
    </AccountChrome>
  );
}
