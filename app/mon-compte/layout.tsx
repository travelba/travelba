import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { siteConfig } from "@/lib/site";
import { AccountNav } from "@/components/account/AccountNav";
import { BrandMark } from "@/components/crm/ui";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-admin-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata = {
  title: `Mon compte — ${siteConfig.shortName}`,
  robots: { index: false, follow: false },
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const name = customerFullName(customer);
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";

  return (
    <div
      className={`account-app admin-af min-h-screen ${display.variable} ${sans.variable}`}
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[var(--aura-surface)]/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 px-4 py-3 md:max-w-[960px] sm:px-6 md:h-16">
          <BrandMark href="/mon-compte" subtitle="Aura · Espace client" />
          <AccountNav customerName={name} initials={initials} />
        </div>
      </header>
      <main className="mx-auto max-w-[480px] px-4 pb-28 pt-6 md:max-w-[960px] sm:px-6 sm:pt-8 md:pb-10">
        {children}
      </main>
      <footer className="mx-auto hidden max-w-[960px] px-4 pb-10 pt-2 text-xs text-muted md:block sm:px-6">
        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteConfig.name} — Voyage
            d&apos;affaires
          </p>
          <p>
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="hover:text-[var(--admin-navy)]"
            >
              {siteConfig.contactEmail}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
