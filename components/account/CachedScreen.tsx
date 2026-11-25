"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AccountPage } from "@/components/account/AccountPage";
import { useAccountCacheUser } from "@/components/account/AccountCache";
import { peekEspace, readEspace } from "@/lib/client/stay-cache";
import type { ClientShell, ShellDocument, ShellStay } from "@/lib/crm/client-shell";

const DOC_LABEL: Record<string, string> = {
  passport: "Passeport",
  id_card: "Pièce d'identité",
  visa: "Visa",
  insurance: "Assurance",
  other: "Pièce",
};

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[#0B192C]/10 ${className}`} aria-hidden />;
}

function StayCard({ stay }: { stay: ShellStay }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-sm">
      <div className="bg-[#0B192C] px-4 py-5 text-white">
        {stay.when ? <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C5A880]">{stay.when}</p> : null}
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight">{stay.title}</h2>
        {stay.place ? <p className="mt-1 text-[13px] text-white/80">{stay.place}</p> : null}
      </div>
    </article>
  );
}

function DocRow({ doc }: { doc: ShellDocument }) {
  return (
    <div className="rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9e7e51]">{DOC_LABEL[doc.type] || "Pièce"}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">{doc.name}</p>
    </div>
  );
}

export function CachedScreen({ screen }: { screen: "home" | "reservations" | "documents" | "stay" | "transactions" }) {
  const userId = useAccountCacheUser();
  const pathname = usePathname() || "";
  const [shell, setShell] = useState<ClientShell | null>(() => peekEspace(userId));

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void readEspace(userId).then((value) => {
      if (alive) setShell(value);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const stays = shell?.stays || [];
  const upcoming = stays.filter((stay) => stay.upcoming);
  const reference = decodeURIComponent((pathname.split("/").pop() || "").split("?")[0] || "");
  const current = stays.find((stay) => stay.reference === reference) || null;

  return (
    <AccountPage motion="skeleton">
      <div className="space-y-3" aria-busy="true">
        <p className="sr-only">Chargement de votre espace.</p>
        {screen === "home" ? (
          <>
            <Block className="h-3 w-40 rounded" />
            <p className="font-display text-2xl font-bold text-[var(--admin-navy)]">
              {shell?.greeting ? `Bonjour ${shell.greeting}` : <Block className="h-8 w-48 rounded-lg" />}
            </p>
            {upcoming[0] ? <StayCard stay={upcoming[0]} /> : <Block className="h-[22rem] rounded-2xl" />}
          </>
        ) : null}
        {screen === "reservations" ? (
          <>
            <Block className="h-8 w-48 rounded-lg" />
            {(upcoming.length ? upcoming : stays).slice(0, 4).map((stay) => (
              <StayCard key={stay.reference} stay={stay} />
            ))}
            {stays.length ? null : (
              <>
                <Block className="h-40 rounded-2xl" />
                <Block className="h-40 rounded-2xl" />
              </>
            )}
          </>
        ) : null}
        {screen === "stay" ? (
          <>
            {current ? <StayCard stay={current} /> : <Block className="h-64 rounded-2xl" />}
            <Block className="h-24 rounded-2xl" />
            <Block className="h-24 rounded-2xl" />
          </>
        ) : null}
        {screen === "documents" ? (
          <>
            <p className="font-display text-2xl font-bold text-[var(--admin-navy)]">Pièces</p>
            {(shell?.documents || []).slice(0, 6).map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
            {shell?.documents.length ? null : (
              <>
                <Block className="h-20 rounded-2xl" />
                <Block className="h-20 rounded-2xl" />
              </>
            )}
          </>
        ) : null}
        {screen === "transactions" ? (
          <>
            <p className="font-display text-2xl font-bold text-[var(--admin-navy)]">Transactions</p>
            <Block className="h-16 rounded-2xl" />
            <Block className="h-16 rounded-2xl" />
            <Block className="h-16 rounded-2xl" />
          </>
        ) : null}
      </div>
    </AccountPage>
  );
}
