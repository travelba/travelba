"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
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

export function Header() {
  const t = useTranslations("Nav");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-2 via-accent to-accent-3 text-sm font-bold text-background">
            T
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:block">
            Travel Business <span className="text-muted">Agency</span>
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
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <a
            href="#contact"
            className="hidden rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform hover:scale-[1.03] sm:inline-flex"
          >
            {t("cta")}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-background/95 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-5 py-4 sm:px-8">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-border/60 py-3 text-base text-foreground/90 last:border-0"
              >
                {t(item.key)}
              </a>
            ))}
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-4 rounded-full bg-foreground px-4 py-3 text-center text-sm font-semibold text-background"
            >
              {t("cta")}
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
