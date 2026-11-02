"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { siteConfig } from "@/lib/site";

const NAV_ITEMS = [
  { key: "about", href: "#about" },
  { key: "services", href: "#services" },
  { key: "why", href: "#why" },
  { key: "process", href: "#process" },
  { key: "testimonials", href: "#testimonials" },
  { key: "contact", href: "#contact" },
] as const;

function closeMenu(event: { currentTarget: EventTarget & Element }) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function Header() {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="group flex items-center gap-2.5">
          <BrandMark />
          <span className="hidden text-sm font-semibold tracking-tight sm:block">
            Travel Business <span className="text-[#C5A880]">Agency</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {t(item.key)}
            </a>
          ))}
          <Link href="/connexion" className="text-sm text-muted transition-colors hover:text-foreground">
            {t("account")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <a
            href="#contact"
            className="hidden rounded-full bg-[#C5A880] px-4 py-2 text-sm font-semibold text-[#0B192C] transition-colors hover:bg-[#d4bc9a] sm:inline-flex"
          >
            {t("cta")}
          </a>
          {/* <details> natif : le menu s’ouvre avant l’hydratation, y compris sur iOS. */}
          <details className="lg:hidden">
            <summary
              className="menu-toggle inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border text-foreground"
              aria-label={tCommon("menu")}
            >
              <Menu className="menu-icon-open h-5 w-5" />
              <X className="menu-icon-close h-5 w-5" />
            </summary>
            <nav className="absolute inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-auto border-t border-border bg-background/95 backdrop-blur-xl">
              <div className="mx-auto flex max-w-7xl flex-col px-5 py-4 sm:px-8">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={closeMenu}
                    className="border-b border-border/60 py-3 text-base text-foreground/90"
                  >
                    {t(item.key)}
                  </a>
                ))}
                <Link
                  href="/connexion"
                  onClick={closeMenu}
                  className="py-3 text-base font-semibold text-foreground"
                >
                  {t("account")}
                </Link>
                <a
                  href={`https://wa.me/${siteConfig.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMenu}
                  className="mt-4 rounded-full bg-[#C5A880] px-4 py-3 text-center text-sm font-semibold text-[#0B192C]"
                >
                  {t("cta")}
                </a>
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
