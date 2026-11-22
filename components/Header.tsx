"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";

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

  return (
    <header className="sticky top-0 z-50 border-b border-[#1A1714]/10 bg-[#F4EFE6]">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <span className="hidden leading-none lg:block">
            <span className="block font-display text-[1.35rem] tracking-tight text-[#1A1714]">
              Travel Business
            </span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.32em] text-[#5C4824]">
              Agency
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-6 xl:flex" aria-label={tCommon("nav")}>
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="text-[13px] text-[#4E4942] transition-colors duration-200 hover:text-[#1A1714]"
            >
              {t(item.key)}
            </a>
          ))}
          <Link
            href="/connexion"
            className="text-[13px] text-[#4E4942] transition-colors duration-200 hover:text-[#1A1714]"
          >
            {t("account")}
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <a href="#contact" className="lux-btn lux-btn-sm hidden sm:inline-flex">
            {t("cta")}
          </a>
          {/* <details> natif : le menu s’ouvre avant l’hydratation, y compris sur iOS. */}
          <details className="xl:hidden">
            <summary
              className="menu-toggle relative z-50 inline-flex h-11 w-11 cursor-pointer items-center justify-center border border-[#1A1714]/15 text-[#1A1714]"
              aria-label={tCommon("menu")}
            >
              <Menu className="menu-icon-open h-5 w-5" />
              <X className="menu-icon-close h-5 w-5" />
            </summary>
            <nav
              className="fixed inset-x-0 bottom-0 top-[4.5rem] z-40 overflow-auto bg-[#F4EFE6] px-6 pb-16 pt-8 text-[#1A1714]"
              aria-label={tCommon("nav")}
            >
              <div className="mx-auto flex max-w-lg flex-col">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    onClick={closeMenu}
                    className="border-b border-[#1A1714]/10 py-3.5 font-display text-[1.85rem] leading-none text-[#1A1714]"
                  >
                    {t(item.key)}
                  </a>
                ))}
                <Link
                  href="/connexion"
                  onClick={closeMenu}
                  className="border-b border-[#1A1714]/10 py-3.5 font-display text-[1.85rem] leading-none text-[#1A1714]"
                >
                  {t("account")}
                </Link>
                <a href="#contact" onClick={closeMenu} className="lux-btn mt-8">
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
