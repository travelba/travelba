"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StayCard } from "@/components/crm/StayCard";
import { BusyBar } from "@/components/crm/BusyBar";
import { stayCardFace } from "@/lib/crm/hotel-arrival";
import { formatDateFr, moneyToInput, parseMoney } from "@/lib/crm/money";
import {
  bookingCardCeilingCents,
  formatPliantAmount,
  pliantSpendStatusLabel,
  pliantSpendTitle,
} from "@/lib/crm/pliant-spend";
import type { CrmPliantTransaction } from "@/lib/crm/types";
import { fieldControlClass } from "@/components/crm/fields";

export function BookingPliantPanel({
  bookingId,
  firstName,
  lastName,
  reference,
  pliantReady,
  ceilingCents,
  last4,
  spends,
}: {
  bookingId: string;
  firstName: string;
  lastName: string;
  reference: string;
  pliantReady: boolean;
  ceilingCents: number | null;
  last4: string | null;
  spends: CrmPliantTransaction[];
}) {
  const router = useRouter();
  const holder = `${firstName} ${lastName}`.trim();
  const [amount, setAmount] = useState(ceilingCents != null ? moneyToInput(ceilingCents / 100) : "");
  const [tail, setTail] = useState(last4);
  const [ready, setReady] = useState(ceilingCents != null);
  const [busy, setBusy] = useState<"idle" | "card" | "sync">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy !== "idle") return;
    const cents = bookingCardCeilingCents(parseMoney(amount));
    if (cents == null) {
      setError("Indiquez un plafond entre 1 € et 100 000 €.");
      return;
    }
    setBusy("card");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/pliant-card`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        last4?: string | null;
        issued?: boolean;
        ceilingCents?: number;
      } | null;
      if (!res.ok || !json || json.error) {
        setError(json?.error || "Pliant n’a pas créé la carte.");
        return;
      }
      if (json.last4) setTail(json.last4);
      setReady(true);
      if (json.ceilingCents) setAmount(moneyToInput(json.ceilingCents / 100));
      setNotice(json.issued ? "Carte créée." : "Plafond mis à jour.");
      router.refresh();
    } catch {
      setError("Pliant n’a pas créé la carte.");
    } finally {
      setBusy("idle");
    }
  }

  async function refreshSpends() {
    if (busy !== "idle") return;
    setBusy("sync");
    setError(null);
    try {
      const res = await fetch("/api/admin/pliant/sync", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "Les dépenses n’ont pas pu être actualisées.");
        return;
      }
      router.refresh();
    } catch {
      setError("Les dépenses n’ont pas pu être actualisées.");
    } finally {
      setBusy("idle");
    }
  }

  return (
    <div id="carte-pliant" className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Carte Pliant</p>
          <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{holder || "Nom manquant"}</p>
          <p className="text-sm text-muted">Une carte pour {reference}. Le plafond se change ici, puis on génère.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={generate}>
          <label className="text-sm text-[var(--admin-navy)]">
            Plafond (€)
            <input
              className={`${fieldControlClass} mt-1 w-36`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label="Plafond de la carte Pliant"
            />
          </label>
          <button
            type="submit"
            className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy !== "idle" || !pliantReady || !holder}
          >
            {busy === "card" ? "Génération…" : ready ? "Mettre à jour le plafond" : "Générer la carte"}
          </button>
        </form>
      </div>
      <BusyBar active={busy !== "idle"} label={busy === "sync" ? "Actualisation des dépenses" : "Génération de la carte"} />
      {!pliantReady ? <p className="text-sm text-[var(--admin-navy)]">Pliant n’est pas branché. La carte ne peut pas être émise.</p> : null}
      {notice ? <p className="text-sm text-[var(--admin-navy)]">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {ready ? (
        <StayCard
          personal
          title="Carte Pliant"
          revealUrl={`/api/admin/bookings/${bookingId}/pliant-card`}
          face={stayCardFace({
            itemId: bookingId,
            hotel: reference,
            holder,
            last4: tail,
            closed: false,
          })}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Dépenses Pliant de ce dossier</p>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" className="text-[#9e7e51] disabled:opacity-50" disabled={busy !== "idle"} onClick={() => void refreshSpends()}>
            Actualiser
          </button>
          <Link href="/admin/pliant" className="font-semibold text-[var(--admin-navy)]">
            Toutes les dépenses
          </Link>
        </div>
      </div>
      {spends.length ? (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {spends.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium text-[var(--admin-navy)]">{pliantSpendTitle(row)}</span>
                <span className="text-muted">
                  {" "}
                  · {formatDateFr(row.booked_at)} · {pliantSpendStatusLabel(row.status)}
                </span>
              </span>
              <span className="font-semibold text-[var(--admin-navy)]">{formatPliantAmount(row.amount_cents, row.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune dépense Pliant sur ce dossier.</p>
      )}
    </div>
  );
}
