"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark, PhoneWallBanner } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";

const TABS = [
  { href: "/mon-compte", label: "Accueil", exact: true, icon: "explore" },
  { href: "/mon-compte/reservations", label: "Réservations", icon: "luggage" },
  { href: "/mon-compte/transactions", label: "Transactions", icon: "receipt_long" },
  { href: "/mon-compte/profil", label: "Mon compte", icon: "badge" },
] as const;

function pageTitle(pathname: string) {
  const hit = TABS.find((t) =>
    "exact" in t && t.exact ? pathname === t.href : pathname.startsWith(t.href)
  );
  return hit?.label ?? "Espace client";
}

export function AccountChrome({
  customerName,
  initials,
  needsPhone,
  children,
}: {
  customerName: string;
  initials: string;
  needsPhone: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitle(pathname);
  const phoneWall = needsPhone && !pathname.startsWith("/mon-compte/profil");

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <div className="account-app admin-af min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#e5e3dc] bg-[rgba(250,249,246,0.9)] shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[480px] items-center justify-between gap-3 px-4 sm:px-5">
          <BrandMark href="/mon-compte" subtitle={title} compact />
          <div className="flex items-center gap-0.5">
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--surface-2)]"
              aria-label="Écrire à l’agence sur WhatsApp"
              title="Écrire à l’agence"
            >
              <Icon name="chat" className="h-[22px] w-[22px]" />
            </a>
            <Link
              href="/mon-compte/profil"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-white ring-1 ring-[var(--admin-gold)]/40"
              aria-label={`Compte ${customerName}`}
            >
              {initials}
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[var(--admin-gold)] ring-2 ring-[var(--background)]" />
            </Link>
          </div>
        </div>
        <nav className="mx-auto hidden max-w-[480px] items-center gap-5 px-4 pb-3 sm:px-6 md:flex">
          {TABS.map((tab) => {
            const active =
              "exact" in tab && tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`pb-1 text-sm tracking-wide transition ${
                  active
                    ? "border-b-2 border-[var(--admin-gold)] font-bold text-[var(--admin-navy)]"
                    : "font-medium text-[#5a5c60] hover:text-[var(--admin-navy)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="ml-auto text-xs font-semibold text-muted hover:text-[var(--admin-navy)]"
          >
            Déconnexion
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-[480px] px-4 pb-28 pt-4 sm:px-5">
        {phoneWall ? <PhoneWallBanner href="/mon-compte/profil" /> : children}
      </main>

      <nav className="account-tabbar md:hidden" aria-label="Navigation compte">
        <div className="mx-auto flex h-16 max-w-[480px] items-center justify-around px-1">
          {TABS.map((tab) => {
            const active =
              "exact" in tab && tab.exact
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 text-[10px] font-bold tracking-tight transition ${
                  active ? "text-[var(--admin-navy)]" : "text-[#5a5c60] hover:text-[var(--admin-navy)]"
                }`}
              >
                <Icon
                  name={tab.icon}
                  className="h-6 w-6"
                  filled={active}
                />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
