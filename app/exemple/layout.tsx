import { notFound } from "next/navigation";
import { AccountChrome } from "@/components/account/AccountChrome";
import { ExampleFetchBridge } from "@/components/account/ExampleFetchBridge";
import { ExampleNotice } from "@/components/account/ExampleNotice";
import { exampleSessionEnabled, EXAMPLE_BASE } from "@/lib/crm/example-session";
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
      <AccountChrome
        customerName={session.name}
        initials={session.initials}
        needsPhone={false}
        basePath={EXAMPLE_BASE}
        preview
      >
        <ExampleNotice />
        {children}
      </AccountChrome>
    </ExampleFetchBridge>
  );
}
