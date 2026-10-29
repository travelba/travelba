"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ReglagesTab = { href: string; label: string; newTab?: boolean; exact?: boolean };

/** Onglets de Réglages : Mise en service, modèles, e-mails client ; accès hôtels et Gmail pour les admins. */
export function reglagesTabs(input: { admin: boolean; showExample: boolean }): ReglagesTab[] {
  return [
    ...(input.admin ? [{ href: "/admin/reglages", label: "Mise en service", exact: true }] : []),
    { href: "/admin/reglages/whatsapp", label: "Modèles WhatsApp" },
    { href: "/admin/reglages/mails", label: "E-mails au client" },
    ...(input.admin
      ? [
          { href: "/admin/reglages/hotels", label: "Accès Hôtels" },
          { href: "/admin/reglages/gmail", label: "Diagnostic Gmail" },
        ]
      : []),
    ...(input.showExample ? [{ href: "/exemple", label: "Aperçu espace client", newTab: true }] : []),
  ];
}

export function ReglagesTabs({ admin = false, showExample = false }: { admin?: boolean; showExample?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-[var(--border)]" aria-label="Onglets Réglages">
      {reglagesTabs({ admin, showExample }).map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
