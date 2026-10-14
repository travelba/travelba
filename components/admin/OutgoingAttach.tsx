"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { costSuggestionReasonLabel, type OutgoingLine } from "@/lib/crm/trip-costs";

export type TargetOption = {
  id: string;
  reference: string;
  title: string;
  client?: string;
  items: { id: string; label: string; kind: string | null; amount: number | null }[];
};

const STAY = "__stay__";
const NEW = "__new__";

function money(amount: number, currency: string) {
  try {
    return formatMoney(amount, currency);
  } catch {
    return formatMoney(amount, "EUR");
  }
}

/** Montant signé de la sortie, et sa devise d’origine quand elle diffère. */
export function OutgoingAmount({ line }: { line: OutgoingLine }) {
  const eur = line.eurAmount != null ? money(line.eurAmount, "EUR") : null;
  const origin = line.currency !== "EUR" ? money(line.refund ? -line.amount : line.amount, line.currency) : null;
  return (
    <span className="text-right">
      <span className="block font-semibold tabular-nums text-[var(--admin-navy)]">{eur || origin || "—"}</span>
      {eur && origin ? <span className="block text-xs tabular-nums text-muted">{origin}</span> : null}
    </span>
  );
}

/**
 * Rattache une sortie à une ligne d’un voyage. Le voyage se cherche ; la ligne se choisit.
 * Rien ne part sans le clic Rattacher.
 */
export function OutgoingAttach({
  line,
  fixedBooking = null,
  compact = false,
}: {
  line: OutgoingLine;
  /** Sur le dossier : le voyage est connu. */
  fixedBooking?: TargetOption | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const top = line.suggestions[0] || null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TargetOption[]>(fixedBooking ? [fixedBooking] : []);
  const [bookingId, setBookingId] = useState<string>(fixedBooking?.id || top?.bookingId || "");
  const [pickedItem, setItemChoice] = useState<string>(top?.itemId || STAY);
  const [saleAmount, setSaleAmount] = useState<string>(line.eurAmount != null ? String(Math.abs(line.eurAmount)) : "");
  const [eurAmount, setEurAmount] = useState<string>("");
  const needsEur = line.eurAmount == null;

  useEffect(() => {
    if (fixedBooking || !open) return;
    const controller = new AbortController();
    const url = query.trim()
      ? `/api/admin/comptabilite/cibles?q=${encodeURIComponent(query.trim())}`
      : bookingId
        ? `/api/admin/comptabilite/cibles?booking=${encodeURIComponent(bookingId)}`
        : "/api/admin/comptabilite/cibles";
    const timer = setTimeout(() => {
      fetch(url, { signal: controller.signal })
        .then((res) => res.json())
        .then((json: { bookings?: TargetOption[] }) => setOptions(json.bookings || []))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, fixedBooking, bookingId]);

  const booking = useMemo(() => options.find((row) => row.id === bookingId) || null, [options, bookingId]);
  /** Ligne retenue : le choix de l’agent s’il existe sur ce voyage, sinon la proposition du voyage, sinon le séjour. */
  const itemChoice = useMemo(() => {
    if (!booking || pickedItem === STAY || pickedItem === NEW) return pickedItem;
    if (booking.items.some((item) => item.id === pickedItem)) return pickedItem;
    const hit = line.suggestions.find((row) => row.bookingId === booking.id);
    return hit?.itemId && booking.items.some((item) => item.id === hit.itemId) ? hit.itemId : STAY;
  }, [booking, pickedItem, line.suggestions]);

  async function post(body: Record<string, unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/comptabilite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: line.source, id: line.id, ...body }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return false;
      }
      setOpen(false);
      router.refresh();
      return true;
    } catch {
      setError("Connexion interrompue. Réessayez.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function attach() {
    if (!bookingId) {
      setError("Choisissez le voyage.");
      return;
    }
    const body: Record<string, unknown> = { action: "attach", booking_id: bookingId };
    if (itemChoice === NEW) body.new_expense = { title: line.party, amount: Number(saleAmount.replace(",", ".")) };
    else if (itemChoice !== STAY) body.item_id = itemChoice;
    if (needsEur) body.eur_amount = Number(eurAmount.replace(",", "."));
    void post(body, "Rattachement impossible. Réessayez.");
  }

  const topLabel = top
    ? `${top.reference}${top.itemLabel ? ` · ${top.itemLabel}` : ""} (${costSuggestionReasonLabel(top.reason)})`
    : null;

  return (
    <div className={compact ? "space-y-2" : "space-y-2 sm:max-w-md"}>
      {!fixedBooking ? (
        topLabel ? (
          <p className="text-xs font-semibold text-[#9e7e51]">Proposition : {topLabel}</p>
        ) : line.agencyCard ? (
          <p className="text-xs text-muted">Carte d’agence : sans doute hors voyage.</p>
        ) : (
          <p className="text-xs text-muted">Aucune proposition</p>
        )
      ) : top?.itemLabel ? (
        <p className="text-xs font-semibold text-[#9e7e51]">Proposition : {top.itemLabel}</p>
      ) : null}
      {open ? (
        <div className="space-y-2 rounded-2xl border border-border bg-white p-3">
          {!fixedBooking ? (
            <>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Référence, destination, nom du client…"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                aria-label="Chercher le voyage"
              />
              <select
                value={bookingId}
                onChange={(event) => setBookingId(event.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                aria-label="Voyage"
              >
                <option value="">Choisir le voyage…</option>
                {options.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.reference} · {row.title}
                    {row.client ? ` · ${row.client}` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <select
            value={itemChoice}
            onChange={(event) => setItemChoice(event.target.value)}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            aria-label="Ligne du voyage"
            disabled={!booking}
          >
            {(booking?.items || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {item.amount != null ? ` · ${money(item.amount, "EUR")}` : ""}
              </option>
            ))}
            <option value={STAY}>Montant du séjour</option>
            <option value={NEW}>Nouvelle dépense</option>
          </select>
          {itemChoice === NEW ? (
            <label className="block text-xs text-muted">
              Prix vendu au client (€)
              <input
                value={saleAmount}
                onChange={(event) => setSaleAmount(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm text-[var(--admin-navy)]"
              />
            </label>
          ) : null}
          {needsEur ? (
            <label className="block text-xs text-muted">
              Coût en euros de cette sortie ({money(line.amount, line.currency)})
              <input
                value={eurAmount}
                onChange={(event) => setEurAmount(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm text-[var(--admin-navy)]"
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={attach} className="admin-af-btn rounded-full px-3 py-1 text-sm">
              {busy ? "En cours…" : "Rattacher"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setOpen(true)} className="admin-af-btn rounded-full px-3 py-1 text-sm">
            Rattacher
          </button>
          {!fixedBooking ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "outside" }, "Impossible de classer cette sortie.")}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
            >
              Hors voyage
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ligne d’une sortie : bénéficiaire, date, carte, montant, puis le rattachement. */
export function OutgoingRow({ line, fixedBooking = null }: { line: OutgoingLine; fixedBooking?: TargetOption | null }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[var(--admin-navy)]">{line.party}</span>
        <span className="block text-xs text-muted">
          {line.occurredOn ? formatDateFr(line.occurredOn) : "—"} · {line.source === "pliant" ? "Pliant" : "Revolut"} · {line.kind}
          {line.card ? ` · ${line.card}` : ""}
          {line.text ? ` · ${line.text}` : ""}
        </span>
      </span>
      <OutgoingAmount line={line} />
      <div className="basis-full sm:basis-auto">
        <OutgoingAttach line={line} fixedBooking={fixedBooking} compact />
      </div>
    </li>
  );
}
