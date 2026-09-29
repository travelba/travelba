"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [{ href: "/admin/outils/whatsapp", label: "WhatsApp" }];

export function OutilsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-6 flex gap-6 border-b border-[var(--border)]" aria-label="Sous-onglets Outils">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm transition ${
              active
                ? "border-[var(--admin-gold)] font-bold text-[var(--admin-navy)]"
                : "border-transparent font-medium text-muted hover:text-[var(--admin-navy)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
