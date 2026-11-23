"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";

const LINKS = [
  { key: "home", href: "/voyages" },
  { key: "destinations", href: "/voyages/destinations" },
  { key: "themes", href: "/voyages/envies" },
  { key: "signature", href: "/voyages/signature" },
] as const;

export function VoyageNav() {
  const t = useTranslations("VoyageNav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="sticky top-[4.5rem] z-40 border-b border-[#1A1714]/10 bg-[#F4EFE6]/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-5 py-3 sm:gap-6 sm:px-8">
        {LINKS.map((item) => {
          const active = item.href === "/voyages" ? pathname === "/voyages" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center text-[11px] font-medium uppercase tracking-[0.12em] sm:tracking-[0.18em] ${
                  active ? "text-[#1A1714]" : "text-[#6A645C] hover:text-[#1A1714]"
                }`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
