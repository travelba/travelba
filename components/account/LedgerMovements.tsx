"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/crm/icons";

export type LedgerMovementRow = {
  id: string;
  credit: boolean;
  title: string;
  amountLabel: string;
  occurredLabel: string;
  kindLabel: string;
  tripName: string | null;
  tripDates: string | null;
  reference: string | null;
  carnetHref: string | null;
};

export function LedgerMovements({ rows }: { rows: LedgerMovementRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <li
            key={row.id}
            className="rounded-xl border border-[#e9e8e5]/60 bg-white shadow-sm"
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : row.id)}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    row.credit
                      ? "bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                      : "bg-[#efeeeb] text-[var(--admin-navy)]"
                  }`}
                >
                  <Icon
                    name={row.credit ? "south_west" : "receipt_long"}
                    className="h-[22px] w-[22px]"
                  />
                </span>
                <span className="min-w-0">
                  {row.tripName ? (
                    <span className="block text-sm font-semibold text-[var(--admin-navy)]">
                      {row.tripName}
                    </span>
                  ) : null}
                  {row.tripDates ? (
                    <span className="block text-[13px] text-muted">{row.tripDates}</span>
                  ) : null}
                  <span className="block text-[13px] leading-snug text-[var(--admin-navy)]">
                    {row.title}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="whitespace-nowrap text-[16px] font-bold tracking-tight text-[var(--admin-navy)]">
                  {row.amountLabel}
                </span>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                    row.credit
                      ? "border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                      : "border-[#e5e3dc] bg-[#efeeeb] text-[#44474c]"
                  }`}
                >
                  {row.credit ? "Encaissé" : "Posté"}
                </span>
                <Icon
                  name="expand_more"
                  className={`mt-1 h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {open ? (
              <div className="space-y-1 border-t border-[#e9e8e5] px-4 py-3 text-[13px] text-[var(--admin-navy)]">
                <p>
                  <span className="text-muted">Date · </span>
                  {row.occurredLabel}
                </p>
                <p>
                  <span className="text-muted">Type · </span>
                  {row.kindLabel}
                </p>
                {row.reference ? (
                  <p>
                    <span className="text-muted">Référence · </span>
                    {row.reference}
                  </p>
                ) : null}
                <p className="leading-snug">{row.title}</p>
                {row.carnetHref ? (
                  <Link
                    href={row.carnetHref}
                    className="inline-flex pt-1 text-sm font-semibold text-[var(--admin-navy)]"
                  >
                    Ouvrir le carnet
                  </Link>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
