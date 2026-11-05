import { notFound } from "next/navigation";
import { ExampleChrome } from "@/components/account/ExampleChrome";
import { ExampleFetchBridge } from "@/components/account/ExampleFetchBridge";
import { ExampleNotice } from "@/components/account/ExampleNotice";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Aperçu — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function ExampleLayout({ children }: { children: React.ReactNode }) {
  if (!exampleSessionEnabled()) notFound();
  const session = readExample();

  return (
    <ExampleFetchBridge>
      <ExampleChrome customerName={session.name} initials={session.initials}>
        <ExampleNotice />
        {children}
      </ExampleChrome>
    </ExampleFetchBridge>
  );
}
