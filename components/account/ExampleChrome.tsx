"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccountChrome } from "@/components/account/AccountChrome";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";

/** Même chrome que l’espace client. L’onglet Hôtels seulement sur l’aperçu de la recherche. */
export function ExampleChrome({
  customerName,
  initials,
  children,
}: {
  customerName: string;
  initials: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const hotels = path === `${EXAMPLE_BASE}/hotels` || path.startsWith(`${EXAMPLE_BASE}/hotels/`);
  return (
    <AccountChrome
      customerName={customerName}
      initials={initials}
      needsPhone={false}
      basePath={EXAMPLE_BASE}
      preview
      hotels={hotels}
    >
      {children}
    </AccountChrome>
  );
}
