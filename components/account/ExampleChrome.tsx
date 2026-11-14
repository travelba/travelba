"use client";

import type { ReactNode } from "react";
import { AccountChrome } from "@/components/account/AccountChrome";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";

/** Même chrome que l’espace client. L’aperçu a l’accès Hôtels, l’onglet est là avant le clic. */
export function ExampleChrome({
  customerName,
  initials,
  children,
}: {
  customerName: string;
  initials: string;
  children: ReactNode;
}) {
  return (
    <AccountChrome
      customerName={customerName}
      initials={initials}
      needsPhone={false}
      basePath={EXAMPLE_BASE}
      preview
      hotels
    >
      {children}
    </AccountChrome>
  );
}
