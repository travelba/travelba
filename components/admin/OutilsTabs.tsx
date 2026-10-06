"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Onglets : messages WhatsApp, e-mails au client, diagnostic Gmail, aperçu client (hors production). */
export function outilsTabs(showExample: boolean) {
  return [
    { href: "/admin/outils/whatsapp", label: "Messages WhatsApp", newTab: false },
    { href: "/admin/outils/mails", label: "E-mails au client", newTab: false },
    { href: "/admin/outils/gmail", label: "Diagnostic Gmail", newTab: false },
    ...(showExample ? [{ href: "/exemple", label: "Aperçu espace client", newTab: true }] : []),
  ];
}

export function OutilsTabs({ showExample = false }: { showExample?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-[var(--border)]" aria-label="Sous-onglets Outils">
      {outilsTabs(showExample).map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            target={tab.newTab ? "_blank" : undefined}
            rel={tab.newTab ? "noreferrer" : undefined}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 text-sm transition ${
              active
                ? "border-[var(--admin-gold)] font-bold text-[var(--admin-navy)]"
                : "border-transparent font-medium text-muted hover:text-[var(--admin-navy)]"
            }`}
          >
            {tab.label}
            {tab.newTab ? " ↗" : ""}
          </Link>
        );
      })}
    </nav>
  );
}
