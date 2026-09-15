import { Montserrat, Source_Sans_3 } from "next/font/google";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { siteConfig } from "@/lib/site";
import { AccountNav } from "@/components/account/AccountNav";
import { BrandMark } from "@/components/crm/ui";

const display = Montserrat({
  subsets: ["latin"],
  variable: "--font-admin-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const sans = Source_Sans_3({
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
  const initials = [customer.first_name?.[0], customer.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "TB";

  return (
    <div className={`admin-af min-h-screen ${display.variable} ${sans.variable}`}>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 border-t-[3px] border-t-[var(--admin-red)] bg-white shadow-sm">
        <div className="mx-auto flex max-w-[960px] flex-col gap-3 px-4 py-3 sm:px-6 md:h-20 md:flex-row md:items-center md:justify-between md:gap-4 md:py-0">
          <BrandMark href="/mon-compte" subtitle="Espace client" />
          <AccountNav customerName={name} initials={initials} />
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="mx-auto max-w-[960px] px-4 pb-10 pt-2 text-xs text-muted sm:px-6">
        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Travelba — Voyage d&apos;affaires</p>
          <p>
            <a href={`mailto:${siteConfig.contactEmail}`} className="hover:text-[var(--admin-navy)]">
              {siteConfig.contactEmail}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
