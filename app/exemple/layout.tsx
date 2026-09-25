import { notFound } from "next/navigation";
import { AccountChrome } from "@/components/account/AccountChrome";
import { exampleSession, exampleSessionEnabled, EXAMPLE_BASE } from "@/lib/crm/example-session";
import { siteConfig } from "@/lib/site";

export const metadata = {
  title: `Aperçu — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default function ExampleLayout({ children }: { children: React.ReactNode }) {
  if (!exampleSessionEnabled()) notFound();
  const session = exampleSession();

  return (
    <AccountChrome
      customerName={session.name}
      initials={session.initials}
      needsPhone={false}
      basePath={EXAMPLE_BASE}
      preview
    >
      <p className="mb-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f3eb] px-4 py-2.5 text-sm text-[var(--admin-navy)]">
        Aperçu local. Rien n’est enregistré, et ce séjour n’existe pas dans la base.
      </p>
      {children}
    </AccountChrome>
  );
}
