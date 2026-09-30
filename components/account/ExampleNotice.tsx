"use client";

import { usePathname } from "next/navigation";

export function ExampleNotice() {
  const pathname = usePathname();
  if (pathname.endsWith("/bienvenue")) return null;

  return (
    <p className="mb-3 rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f3eb] px-4 py-2.5 text-sm text-[var(--admin-navy)]">
      Aperçu local. Les gestes restent dans cette session. Rien n’est écrit en base.
    </p>
  );
}
