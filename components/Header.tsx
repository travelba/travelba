"use client";

import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";

const PAGES = [
  { key: "voyages", href: "/voyages" },
  { key: "app", href: "/application" },
  { key: "events", href: "/evenements" },
  { key: "family", href: "/famille" },
] as const;

const AGENCY = [
  { key: "about", href: "/#about" },
  { key: "services", href: "/#services" },
  { key: "why", href: "/#why" },
  { key: "process", href: "/#process" },
  { key: "testimonials", href: "/#testimonials" },
] as const;

function closeMenu(event: { currentTarget: EventTarget & Element }) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function Header() {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const locale = useLocale();
  const onHome = pathname === "/";

  function sectionHref(hash: string) {
    return onHome ? hash : `/${locale}${hash}`;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#1A1714]/10 bg-[#F4EFE6]">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href={onHome ? "#top" : `/${locale}`} className="flex min-w-0 items-center gap-3">
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

        <nav className="hidden items-center gap-5 xl:flex" aria-label={tCommon("nav")}>
          {PAGES.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`text-[13px] transition-colors duration-200 ${
                  active ? "text-[#1A1714]" : "text-[#4E4942] hover:text-[#1A1714]"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
          <a
            href={sectionHref("#about")}
            className="text-[13px] text-[#4E4942] transition-colors duration-200 hover:text-[#1A1714]"
          >
            {t("agency")}
          </a>
          <a
            href={sectionHref("#contact")}
            className="text-[13px] text-[#4E4942] transition-colors duration-200 hover:text-[#1A1714]"
          >
            {t("contact")}
          </a>
          <NextLink
            href="/connexion"
            className="text-[13px] text-[#4E4942] transition-colors duration-200 hover:text-[#1A1714]"
          >
            {t("account")}
          </NextLink>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <a href={sectionHref("#contact")} className="lux-btn lux-btn-sm hidden sm:inline-flex">
            {t("cta")}
          </a>
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
                {PAGES.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={closeMenu}
                    className="border-b border-[#1A1714]/10 py-3.5 font-display text-[1.85rem] leading-none text-[#1A1714]"
                  >
                    {t(item.key)}
                  </Link>
                ))}
                {AGENCY.map((item) => (
                  <a
                    key={item.key}
                    href={sectionHref(item.href.slice(1))}
                    onClick={closeMenu}
                    className="border-b border-[#1A1714]/10 py-3 text-base text-[#3C3833]"
                  >
                    {t(item.key)}
                  </a>
                ))}
                <a
                  href={sectionHref("#contact")}
                  onClick={closeMenu}
                  className="border-b border-[#1A1714]/10 py-3 text-base text-[#3C3833]"
                >
                  {t("contact")}
                </a>
                <NextLink
                  href="/connexion"
                  onClick={closeMenu}
                  className="border-b border-[#1A1714]/10 py-3.5 font-display text-[1.85rem] leading-none text-[#1A1714]"
                >
                  {t("account")}
                </NextLink>
                <a href={sectionHref("#contact")} onClick={closeMenu} className="lux-btn mt-8">
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
