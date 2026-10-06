"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLIENT_PROFILE_NAV } from "@/lib/crm/profile-nav";

/** Coupure seulement si le mot ne tient pas dans sa pastille. */
function pillLabel(label: string) {
  if (label === "Facturation") return "Factura\u00adtion";
  return label;
}

export function ProfileSubnav({ basePath = "/mon-compte" }: { basePath?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex min-w-0 rounded-full bg-[#efeeeb] p-1 shadow-[0_1px_2px_rgba(11,25,44,0.04)]"
      aria-label="Sections du compte"
    >
      {CLIENT_PROFILE_NAV.map((link) => {
        const href = link.href.replace("/mon-compte", basePath);
        const active = link.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={link.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 min-w-0 flex-1 items-center justify-center rounded-full px-1 text-center text-[12px] leading-none font-semibold tracking-tight transition ${
              active
                ? "bg-[var(--admin-navy)] text-white shadow-sm"
                : "text-[#5a5c60] hover:text-[var(--admin-navy)]"
            }`}
          >
            {pillLabel(link.label)}
          </Link>
        );
      })}
    </nav>
  );
}
