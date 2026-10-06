"use client";

import { useState } from "react";
import { LedgerMovements } from "@/components/account/LedgerMovements";
import { Icon } from "@/components/crm/icons";
import type { SpendingCard } from "@/lib/crm/spending-desk";

export function SpendingBookings({ cards }: { cards: SpendingCard[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="m-0 list-none space-y-2 p-0 marker:content-none">
      {cards.map((card) => {
        const open = openId === card.id;
        return (
          <li key={card.id} className="rounded-xl border border-[#e9e8e5]/60 bg-white shadow-sm">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : card.id)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-snug text-[var(--admin-navy)]">
                  {card.title}
                </span>
                {card.dates ? (
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{card.dates}</span>
                ) : null}
                {card.reference ? (
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{card.reference}</span>
                ) : null}
                <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                  Compte de rattachement
                </span>
                <span className="mt-0.5 block text-[13px] font-semibold text-[var(--admin-navy)]">
                  {card.accountName}
                </span>
                {card.remainingLabel ? (
                  <span className="mt-0.5 block text-[12px] text-[#9c7c4e]">{card.remainingLabel}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="whitespace-nowrap text-[16px] font-bold tracking-tight text-[var(--admin-navy)]">
                  {card.amountLabel}
                </span>
                <Icon
                  name="expand_more"
                  className={`mt-1 h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {open ? (
              <div className="border-t border-[#e9e8e5] bg-[#faf9f6] px-3 py-3">
                {card.movements.length ? (
                  <LedgerMovements rows={card.movements} />
                ) : (
                  <p className="text-[13px] text-muted">Aucun mouvement comptabilisé sur ce séjour.</p>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
