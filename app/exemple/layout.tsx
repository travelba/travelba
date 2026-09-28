import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AccountChrome } from "@/components/account/AccountChrome";
import { ExampleFetchBridge } from "@/components/account/ExampleFetchBridge";
import { exampleSessionEnabled, EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Aperçu — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function ExampleLayout({ children }: { children: React.ReactNode }) {
  if (!exampleSessionEnabled()) notFound();
  const surface = (await headers()).get("x-travelba-exemple");
  if (surface === "agence") {
    return <div className="admin-af min-h-screen">{children}</div>;
  }
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
        <p className="mb-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f3eb] px-4 py-2.5 text-sm text-[var(--admin-navy)]">
          Aperçu local. Les gestes restent dans cette session. Rien n’est écrit en base.
        </p>
        {children}
      </AccountChrome>
    </ExampleFetchBridge>
  );
}
