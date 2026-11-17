"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import { formatDateTimeFr } from "@/lib/crm/dates";
import {
  endedPaymentHeading,
  waitingHeading,
  type HotelInbox as HotelInboxModel,
  type HotelInboxRow,
} from "@/lib/crm/hotel-inbox";

const replyClass = {
  treat:
    "inline-block max-w-full break-words rounded-full bg-[var(--admin-peach)] px-2.5 py-1 text-xs font-semibold leading-snug text-[var(--admin-navy)]",
  wait: "inline-block max-w-full break-words rounded-full bg-[#f8f4ed] px-2.5 py-1 text-xs font-semibold leading-snug text-[#9e7e51] ring-1 ring-[var(--admin-gold)]/40",
  silent: "inline-block max-w-full break-words rounded-full bg-[#0B192C] px-2.5 py-1 text-xs font-semibold leading-snug text-[#C5A880]",
} as const;

function statusClass(status: string) {
  if (status.startsWith("Sans réponse")) return replyClass.silent;
  if (status === "En attente") return replyClass.wait;
  return replyClass.treat;
}

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-[#faf9f6]";
const quietClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[#0B192C] px-4 text-sm font-semibold text-[#0B192C]";

function HotelLine({ row, ended = false }: { row: HotelInboxRow; ended?: boolean }) {
  const when = formatDateTimeFr(row.activityAt);
  const place = [row.hotel, row.city].filter(Boolean).join(" · ");
  const who = [row.reference, row.clientName].filter(Boolean).join(" · ");
  const stay = [row.stayLabel, row.kindLabel].filter(Boolean).join(" · ");
  return (
    <li className="px-4 py-3">
      <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-3">
        <p className="min-w-0 font-display font-bold break-words text-[#0B192C]">{place}</p>
        <p className="shrink-0 text-xs tabular-nums text-[#3d4654]">
          {when}
          {when ? ` · ${row.lastWriter}` : row.lastWriter}
        </p>
      </div>
      {who ? <p className="mt-1 break-words text-sm text-[#3d4654]">{who}</p> : null}
      {stay ? <p className="mt-0.5 text-sm text-[#0B192C]">{stay}</p> : null}
      <div className="mt-2">
        <span className={statusClass(row.status)}>{row.status}</span>
      </div>
      {row.excerpt ? (
        <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm leading-relaxed text-[#0B192C]">{row.excerpt}</p>
      ) : null}
      {ended ? (
        <div className="mt-3">
          <Link href={row.dossierHref} className={quietClass}>
            Ouvrir le dossier
          </Link>
        </div>
      ) : (
        <>
          {row.section === "payment" ? <PaymentFacts row={row} /> : null}
          <RowActions row={row} />
        </>
      )}
    </li>
  );
}

function PaymentFacts({ row }: { row: HotelInboxRow }) {
  const state = row.paymentState === "paid" ? row.paidLabel : row.paymentState === "unpaid" ? "À payer" : null;
  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      {row.signal ? <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">{row.signal}</p> : null}
      {row.amountLabel ? <p className="text-sm font-semibold tabular-nums text-[#0B192C]">{row.amountLabel}</p> : null}
      {state ? (
        <span className="inline-block max-w-full break-words rounded-full bg-white px-2.5 py-1 text-xs font-semibold leading-snug text-[#3d4654] ring-1 ring-[#e5e0d4]">
          {state}
        </span>
      ) : null}
      {row.cardLabel ? <p className="text-sm text-[#0B192C]">{row.cardLabel}</p> : <CreateCard row={row} />}
    </div>
  );
}

function RowActions({ row }: { row: HotelInboxRow }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {row.lastWriter === "L'hôtel" ? (
        <Link href={row.href} className={buttonClass}>
          Répondre
        </Link>
      ) : (
        <Link href={row.href} className={buttonClass}>
          Relancer
        </Link>
      )}
      {row.payUrl ? (
        <a href={row.payUrl} target="_blank" rel="noopener noreferrer" className={quietClass}>
          Ouvrir le lien de paiement
        </a>
      ) : null}
      <Classify row={row} />
      <Link href={row.dossierHref} className={quietClass}>
        Ouvrir le dossier
      </Link>
    </div>
  );
}

function Classify({ row }: { row: HotelInboxRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className={quietClass} onClick={() => setOpen(true)}>
        Classer
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        void fetch(`/api/admin/bookings/${row.bookingId}/hotel-desk`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "classer", itemId: row.itemId, kind: row.kind, note }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const json = (await res.json().catch(() => null)) as { error?: string } | null;
              setError(json?.error || "Le courrier n’a pas pu être classé.");
              return;
            }
            setOpen(false);
            router.refresh();
          })
          .catch(() => setError("Le courrier n’a pas pu être classé."))
          .finally(() => setBusy(false));
      }}
    >
      <label className="sr-only" htmlFor={`classer-${row.id}`}>
        Note de classement
      </label>
      <input
        id={`classer-${row.id}`}
        value={note}
        maxLength={500}
        placeholder="Note, facultative"
        onChange={(event) => setNote(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[#d9d1c3] bg-white px-2 py-1.5 text-xs text-[#0B192C] outline-none focus:border-[#0B192C]"
      />
      <button type="submit" className="text-xs font-semibold text-[#0B192C] disabled:opacity-50" disabled={busy}>
        {busy ? "…" : "Classer, sans e-mail"}
      </button>
      <button type="button" className="text-xs font-semibold text-[#3d4654]" onClick={() => setOpen(false)}>
        Annuler
      </button>
      {error ? <p className="basis-full text-xs font-semibold text-red-700">{error}</p> : null}
    </form>
  );
}

function CreateCard({ row }: { row: HotelInboxRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ceiling, setCeiling] = useState(row.ceilingEuros);
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className={quietClass} onClick={() => setOpen(true)}>
        Créer la carte
      </button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        void fetch(`/api/admin/bookings/${row.bookingId}/cards`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "issue",
            amount: ceiling,
            transactionAmount: ceiling,
            transactionCount: count,
            firstName: row.clientFirst,
            lastName: row.clientLast,
            designation: row.hotel.slice(0, 40),
          }),
        })
          .then(async (res) => {
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) {
              setError(json?.error || "La carte n’a pas pu être créée.");
              return;
            }
            setOpen(false);
            router.refresh();
          })
          .catch(() => setError("La carte n’a pas pu être créée."))
          .finally(() => setBusy(false));
      }}
    >
      <label className="text-xs font-semibold text-[#0B192C]">
        Plafond (€)
        <input
          inputMode="decimal"
          required
          value={ceiling}
          onChange={(event) => setCeiling(event.target.value)}
          aria-label="Plafond en euros"
          className="mt-1 w-28 rounded-lg border border-[#d9d1c3] bg-white px-2 py-1.5 text-sm text-[#0B192C] outline-none focus:border-[#0B192C]"
        />
      </label>
      <label className="text-xs font-semibold text-[#0B192C]">
        Transactions
        <input
          inputMode="numeric"
          required
          value={count}
          onChange={(event) => setCount(event.target.value)}
          aria-label="Nombre de transactions"
          className="mt-1 w-24 rounded-lg border border-[#d9d1c3] bg-white px-2 py-1.5 text-sm text-[#0B192C] outline-none focus:border-[#0B192C]"
        />
      </label>
      <button type="submit" className={buttonClass} disabled={busy}>
        {busy ? "…" : "Confirmer la création"}
      </button>
      <button type="button" className="text-xs font-semibold text-[#3d4654]" onClick={() => setOpen(false)}>
        Annuler
      </button>
      {error ? <p className="basis-full text-xs font-semibold text-red-700">{error}</p> : null}
    </form>
  );
}

function Block({
  id,
  title,
  hint,
  rows,
}: {
  id: string;
  title: string;
  hint: string;
  rows: HotelInboxRow[];
}) {
  if (!rows.length) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-display text-lg font-bold text-[#0B192C]">
        {title}
      </h2>
      <p className="mt-1 text-sm text-[#3d4654]">{hint}</p>
      <ul className="mt-3 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
        {rows.map((row) => (
          <HotelLine key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

/** Une liste : paiement, autres réponses, envois sans réponse, puis le reste. */
export function HotelInbox({ inbox }: { inbox: HotelInboxModel }) {
  const empty = !inbox.payment.length && !inbox.replies.length && !inbox.unanswered.length && !inbox.waiting.length && !inbox.rest.length && !inbox.endedUnpaid.length;
  return (
    <div className="space-y-6">
      <Block
        id="hotels-paiement"
        title="Paiement Pliant à faire"
        hint="L’hôtel a envoyé un lien, une préautorisation, une demande de carte ou une facture. Rien n’est payé sans vous."
        rows={inbox.payment}
      />
      <Block
        id="hotels-reponses"
        title="Autres réponses à traiter"
        hint="L’hôtel a écrit en dernier. Répondre ouvre le brouillon : il part seulement après confirmation."
        rows={inbox.replies}
      />
      <section aria-labelledby="hotels-silence">
        <h2 id="hotels-silence" className="font-display text-lg font-bold text-[#0B192C]">
          Envoyé sans réponse
        </h2>
        <p className="mt-1 text-sm text-[#3d4654]">Relancer ouvre le brouillon. Il part seulement après confirmation.</p>
        {inbox.unanswered.length ? (
          <ul className="mt-3 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
            {inbox.unanswered.map((row) => (
              <HotelLine key={row.id} row={row} />
            ))}
          </ul>
        ) : null}
        {inbox.waiting.length ? (
          <details className="group/wait mt-3 overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#0B192C] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
              <span>{waitingHeading(inbox.waiting.length)}</span>
              <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/wait:rotate-180" />
            </summary>
            <ul className="divide-y divide-[#e5e0d4] border-t border-[#e5e0d4]">
              {inbox.waiting.map((row) => (
                <HotelLine key={row.id} row={row} />
              ))}
            </ul>
          </details>
        ) : null}
        {!inbox.unanswered.length && !inbox.waiting.length ? <p className="mt-2 text-sm text-[#3d4654]">Aucun envoi en attente.</p> : null}
      </section>
      {inbox.rest.length ? (
        <details className="group/rest overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#0B192C] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
            <span>Le reste · {inbox.rest.length}</span>
            <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/rest:rotate-180" />
          </summary>
          <ul className="divide-y divide-[#e5e0d4] border-t border-[#e5e0d4]">
            {inbox.rest.map((row) => (
              <HotelLine key={row.id} row={row} />
            ))}
          </ul>
        </details>
      ) : null}
      {inbox.endedUnpaid.length ? (
        <details className="group/ended">
          <summary className="cursor-pointer list-none text-sm text-[#3d4654] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
            {endedPaymentHeading(inbox.endedUnpaid.length)}
          </summary>
          <ul className="mt-2 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
            {inbox.endedUnpaid.map((row) => (
              <HotelLine key={row.id} row={row} ended />
            ))}
          </ul>
        </details>
      ) : null}
      {empty ? <p className="text-sm text-[#3d4654]">Rien à traiter pour le moment.</p> : null}
    </div>
  );
}
