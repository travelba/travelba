import type { ReactNode } from "react";
import { AccountChrome } from "@/components/account/AccountChrome";
import { DEAUVILLE_STAY } from "@/lib/crm/deauville-preview";

export function DeauvilleClientFrame({ children }: { children: ReactNode }) {
  return (
    <AccountChrome customerName={DEAUVILLE_STAY.client} initials="BB" needsPhone={false} basePath="/apercu/deauville" preview>
      <div className="space-y-4">
        <p className="rounded-2xl bg-[#f4efe4] px-4 py-3 text-sm text-[#0B192C]">
          Aperçu fictif du séjour de {DEAUVILLE_STAY.client}. Rien n’est enregistré, rien n’est envoyé.
        </p>
        <header className="overflow-hidden rounded-[1.6rem] bg-[#0B192C] px-5 py-6 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">{DEAUVILLE_STAY.reference}</p>
          <h1 className="font-display text-3xl font-semibold">Deauville</h1>
          <p className="mt-1 text-sm text-white/80">{DEAUVILLE_STAY.hotel}</p>
          <p className="mt-2 text-sm text-white/80">ven. 30 – sam. 31 octobre 2026 · {DEAUVILLE_STAY.covers} couverts</p>
        </header>
        {children}
      </div>
    </AccountChrome>
  );
}
