"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLIENT_PROFILE_NAV } from "@/lib/crm/profile-nav";

export function ProfileSubnav({ basePath = "/mon-compte" }: { basePath?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex rounded-full bg-[#efeeeb] p-1 shadow-[0_1px_2px_rgba(11,25,44,0.04)]"
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
            className={`flex h-10 flex-1 items-center justify-center rounded-full px-2 text-center text-[12px] font-semibold transition ${
              active
                ? "bg-[var(--admin-navy)] text-white shadow-sm"
                : "text-[#5a5c60] hover:text-[var(--admin-navy)]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
