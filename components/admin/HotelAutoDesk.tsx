"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AutonomousDeskLine } from "@/lib/crm/hotel-auto";

export function HotelAutoDesk({ lines }: { lines: AutonomousDeskLine[] }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [note, setNote] = useState("");

  async function seen(line: AutonomousDeskLine) {
    setPending(line.id);
    setNote("");
    try {
      const response = await fetch("/api/admin/hotel-auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "vu", source: line.source, id: line.id }),
      });
      if (!response.ok) {
        setNote("Le marquage n’a pas abouti.");
        return;
      }
      router.refresh();
    } finally {
      setPending("");
    }
  }

  return (
    <section aria-labelledby="autonome-titre">
      <h2 id="autonome-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Réservations autonomes
      </h2>
      {lines.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {lines.map((line) => (
            <li
              key={`${line.source}-${line.id}`}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-4 py-3 text-[var(--admin-navy)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {line.client} · {line.hotel}
                </p>
                <p className="text-xs text-muted">
                  {line.reference}
                  {line.dates ? ` · ${line.dates}` : ""} · {line.payment}
                </p>
              </div>
              <Link href={line.href} className="text-sm font-semibold underline">
                Dossier
              </Link>
              {line.manual ? (
                <Link href={line.href} className="text-sm font-semibold text-[var(--admin-navy)] underline">
                  Payer à la main
                </Link>
              ) : null}
              <button
                type="button"
                className="min-h-11 rounded-full border border-[var(--admin-navy)] px-4 text-sm font-semibold"
                disabled={pending === line.id}
                onClick={() => seen(line)}
              >
                Vu
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucune réservation autonome à voir.</p>
      )}
      {note ? <p className="mt-2 text-sm text-[#9e7e51]">{note}</p> : null}
    </section>
  );
}
