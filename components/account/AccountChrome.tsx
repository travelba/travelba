"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";
import { ONBOARDING_PATH } from "@/lib/crm/session";
import { accountTabDirection } from "@/lib/crm/account-motion";
import { AccountNightTabs, type NightTabIcon } from "@/components/account/AccountNightTabs";

const TAB_DEFS = [
  { suffix: "", label: "Accueil", exact: true, icon: "explore", night: "home" },
  { suffix: "/hotels", label: "Hôtels", exact: false, icon: "hotel", night: "hotel" },
  { suffix: "/reservations", label: "Réservations", exact: false, icon: "luggage", night: "stay" },
  { suffix: "/transactions", label: "Transactions", exact: false, icon: "receipt_long", night: "ledger" },
  { suffix: "/profil", label: "Mon compte", exact: false, icon: "badge", night: "account" },
] as const;

/** Coupure seulement si le mot ne tient pas dans son quart d’écran. */
function tabLabel(label: string) {
  if (label === "Réservations") return "Réserva\u00adtions";
  if (label === "Transactions") return "Transac\u00adtions";
  return label;
}

function tabsFor(basePath: string, hotels: boolean) {
  return TAB_DEFS.filter((tab) => hotels || tab.suffix !== "/hotels").map((tab) => ({
    ...tab,
    href: `${basePath}${tab.suffix}`,
  }));
}

export function AccountChrome({
  customerName,
  initials,
  needsPhone,
  basePath = "/mon-compte",
  preview = false,
  desk = false,
  hotels = false,
  children,
}: {
  customerName: string;
  initials: string;
  needsPhone: boolean;
  /** Espace ouvert par l’agence (lien desk) : bandeau et « Fermer l’espace ». */
  desk?: boolean;
  /** Racine des liens. `/exemple` pour l’aperçu local, sans session. */
  basePath?: string;
  /** Pas d’appel Auth : l’aperçu ne déconnecte pas une session réelle. */
  preview?: boolean;
  /** Barre noire et onglet Hôtels. Réservé au compte autorisé, tant que la barre n’est pas validée. */
  hotels?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = tabsFor(basePath, hotels);
  const activeIndex = tabs.findIndex((tab) =>
    tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  );
  const title = tabs[activeIndex]?.label ?? "Espace client";
  const phoneWall = needsPhone && !pathname.startsWith(`${basePath}/profil`);

  useEffect(() => {
    if (preview || desk) return;
    if (!pathname.startsWith("/mon-compte")) return;
    void fetch("/api/client/activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname, preview, desk]);

  if (pathname === ONBOARDING_PATH || pathname === `${basePath}/bienvenue`) {
    return <div className="account-app admin-af min-h-screen">{children}</div>;
  }

  async function signOut() {
    if (!preview && !desk) {
      await fetch("/api/client/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sign-out" }),
        keepalive: true,
      }).catch(() => {});
    }
    const supabase = createClient();
    // Cet appareil seulement : « Se déconnecter de tous les appareils » vit dans Mon compte › Sécurité.
    await supabase.auth.signOut({ scope: "local" });
    router.push("/connexion");
    router.refresh();
  }

  const mark =
    activeIndex < 0
      ? null
      : {
          transform: `translateX(${activeIndex * 100}%)`,
        };

  return (
    <div className="account-app admin-af min-h-screen">
      <div className="sticky top-0 z-40 border-b border-[#e5e3dc] bg-[rgba(250,249,246,0.9)] shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-md">
        <header style={{ viewTransitionName: "account-header" }}>
          <div className="mx-auto flex h-16 max-w-[480px] items-center justify-between gap-3 px-4 sm:px-5">
            <BrandMark href={basePath} subtitle={title} compact />
            <div className="flex items-center gap-0.5">
              <a
                href={`https://wa.me/${siteConfig.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="account-press inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--admin-navy)] hover:bg-[var(--surface-2)]"
                aria-label="Écrire à l’agence sur WhatsApp"
                title="Écrire à l’agence"
              >
                <Icon name="chat" className="h-[22px] w-[22px]" />
              </a>
              <Link
                href={`${basePath}/profil`}
                transitionTypes={[accountTabDirection(pathname, `${basePath}/profil`, basePath)]}
                className="account-press relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-white ring-1 ring-[var(--admin-gold)]/40"
                aria-label={`Compte ${customerName}`}
              >
                {initials}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[var(--admin-gold)] ring-2 ring-[var(--background)]" />
              </Link>
            </div>
          </div>
        </header>
        <div className="mx-auto hidden max-w-[480px] items-center gap-5 px-4 pb-3 sm:px-6 md:flex">
          <nav className={`flex min-w-0 items-center overflow-x-auto ${hotels ? "gap-3" : "gap-5"}`} aria-label="Sections">
            {tabs.map((tab) => {
              const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  transitionTypes={[accountTabDirection(pathname, tab.href, basePath)]}
                  aria-current={active ? "page" : undefined}
                  className={`account-press relative pb-1 text-sm tracking-wide ${
                    active ? "font-bold text-[var(--admin-navy)]" : "font-medium text-[#5a5c60] hover:text-[var(--admin-navy)]"
                  }`}
                >
                  {tab.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--admin-gold)]"
                      style={{ viewTransitionName: "account-desktop-mark" }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          {preview ? null : (
            <button
              type="button"
              onClick={signOut}
              className="account-press ml-auto text-xs font-semibold text-muted hover:text-[var(--admin-navy)]"
            >
              Déconnexion
            </button>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[480px] px-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-5 md:pb-28">
        {desk && !preview ? (
          <div
            role="status"
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--admin-navy)] px-4 py-3 text-sm text-white"
          >
            <span>Espace ouvert par l’agence.</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[var(--admin-navy)]"
            >
              Fermer l’espace
            </button>
          </div>
        ) : null}
        {phoneWall ? (
          <p className="mb-3 rounded-2xl bg-[var(--admin-gold)]/25 px-4 py-3 text-sm text-[var(--admin-navy)]">
            Ajoutez un téléphone dans{" "}
            <Link
              href={`${basePath}/profil`}
              transitionTypes={[accountTabDirection(pathname, `${basePath}/profil`, basePath)]}
              className="font-semibold underline"
            >
              Vous
            </Link>{" "}
            pour écrire à l’agence.
          </p>
        ) : null}
        {children}
      </main>

      {hotels ? (
        <AccountNightTabs
          tabs={tabs.map((tab) => ({
            href: tab.href,
            label: tab.label,
            icon: tab.night as NightTabIcon,
            active: tab.exact ? pathname === tab.href : pathname.startsWith(tab.href),
            transition: accountTabDirection(pathname, tab.href, basePath),
          }))}
        />
      ) : (
      <nav
        className="account-tabbar md:hidden"
        style={{ viewTransitionName: "account-tabbar" }}
        aria-label="Navigation compte"
      >
        <div className="mx-auto flex h-14 w-full max-w-[480px] items-stretch px-1">
          {tabs.map((tab) => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                transitionTypes={[accountTabDirection(pathname, tab.href, basePath)]}
                aria-current={active ? "page" : undefined}
                className={`account-press flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-center text-[12px] leading-none tracking-tight ${
                  active ? "font-bold text-[var(--admin-navy)]" : "font-semibold text-[#1a2740] hover:text-[var(--admin-navy)]"
                }`}
              >
                <span
                  className={`account-tab-icon flex h-7 w-10 shrink-0 items-center justify-center rounded-full ${
                    active ? "bg-[var(--admin-navy)] text-[var(--admin-gold)]" : "text-[var(--admin-navy)]"
                  }`}
                >
                  <Icon
                    name={tab.icon}
                    className="h-[1.3rem] w-[1.3rem]"
                    filled={active}
                    strokeWidth={active ? 2.4 : 2.15}
                  />
                </span>
                <span className="block max-w-full">{tabLabel(tab.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      )}
      {mark && !hotels ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[51] md:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 3px)" }}
          aria-hidden
        >
          <div className="relative mx-auto h-0 max-w-[480px]">
            <span
              className="account-tab-mark absolute bottom-0 left-0 h-0.5 w-1/4 rounded-full bg-[var(--admin-gold)]"
              style={{ viewTransitionName: "account-tab-mark", transform: mark.transform }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
