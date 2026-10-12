"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
  pliantReconcileState,
  type PliantCardRecap,
  type PliantSettlementStay,
} from "@/lib/crm/pliant-booking";
import {
  pliantCategoryLabel,
  pliantSignedCents,
  pliantStatusLabel,
  pliantStatusTone,
  pliantTypeLabel,
} from "@/lib/crm/pliant-tx";
import { useIsClient } from "@/lib/crm/use-is-client";

function moneyCode(value: string | null | undefined) {
  const currency = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function euros(cents: number, currency: string | null) {
  try {
    return formatMoney(cents / 100, currency || "EUR");
  } catch {
    return formatMoney(cents / 100, "EUR");
  }
}

function amountLabel(row: PliantCardRecap["spends"][number]) {
  const status = (row.status || "").toUpperCase();
  if (status === "DECLINED" || status === "REVERSED") return "—";
  const signed = pliantSignedCents(row.type, row.billingCents);
  if (signed == null || signed === 0) return "—";
  return euros(signed, row.currency);
}

function originAmount(row: PliantCardRecap["spends"][number]) {
  if (row.transactionCents == null || !row.transactionCurrency) return null;
  if (row.transactionCurrency.toUpperCase() === (row.currency || "EUR").toUpperCase()) return null;
  const signed = pliantSignedCents(row.type, row.transactionCents);
  if (signed == null || signed === 0) return null;
  return euros(signed, row.transactionCurrency);
}

export function PliantSettlement({
  bookingId,
  currency,
  cards,
  stays,
}: {
  bookingId: string;
  currency: string;
  cards: PliantCardRecap[];
  stays: PliantSettlementStay[];
}) {
  const router = useRouter();
  const bookingCurrency = moneyCode(currency);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, { bookingId: string; reference: string }>>({});
  const [ignored, setIgnored] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ transactionId: string; bookingId: string; title: string } | null>(null);
  const choices = stays.length ? stays : [{ id: bookingId, reference: "", label: "Ce séjour" }];

  async function post(transactionId: string, targetId: string, action: "match" | "refuse") {
    if (busyId) return;
    setBusyId(transactionId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${targetId}/pliant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "refuse" ? { transactionId, action: "refuse" } : { transactionId }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        mouvement?: { sens?: string | null };
      } | null;
      if (!res.ok) {
        setError(json?.error || (action === "refuse" ? "Impossible de refuser cette dépense." : "Rapprochement impossible. Réessayez."));
        return;
      }
      if (action === "refuse") {
        setIgnored((current) => (current.includes(transactionId) ? current : [...current, transactionId]));
        setMessage("Dépense refusée.");
      } else {
        const stay = choices.find((row) => row.id === targetId);
        setLinks((current) => ({
          ...current,
          [transactionId]: { bookingId: targetId, reference: stay?.reference || "" },
        }));
        const reference = stay?.reference || "ce séjour";
        setMessage(
          json?.mouvement?.sens === "credit"
            ? `Remboursement rapproché sur ${reference}.`
            : `Dépense rapprochée sur ${reference}.`
        );
      }
      setPicker(null);
      router.refresh();
    } catch {
      setError(action === "refuse" ? "Impossible de refuser cette dépense." : "Rapprochement impossible. Réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="order-2 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Cartes Pliant</h2>
        <p className="mt-1 text-sm text-muted">
          Transactions de chaque carte. Le rapprochement écrit le débit sur la réservation choisie.
        </p>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      {!cards.length ? (
        <div className="admin-af-card rounded-3xl p-5">
          <p className="text-sm text-muted">Aucune carte Pliant sur ce séjour.</p>
        </div>
      ) : (
        cards.map((card) => (
          <article key={card.pliantCardId} className="admin-af-card rounded-3xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-[var(--admin-navy)]">{card.label}</h3>
              {card.last4 ? <p className="text-sm tabular-nums tracking-wide text-muted">···· {card.last4}</p> : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {card.ceilingCents != null ? `Plafond ${formatMoney(card.ceilingCents / 100, card.currency)} · ` : null}
              Dépensé {formatMoney(card.spentCents / 100, card.currency)}
              {card.currency !== bookingCurrency ? ` · carte en ${card.currency}` : null}
            </p>
            {card.spends.length ? (
              <ul className="mt-3 divide-y divide-[#e7e1d6]">
                {card.spends.map((row) => {
                  const link = links[row.id];
                  const state = pliantReconcileState(
                    {
                      type: row.type,
                      status: row.status,
                      billingCents: row.billingCents,
                      billingCurrency: row.currency,
                      matchStatus: ignored.includes(row.id) ? "ignored" : link ? "matched" : row.matchStatus,
                      matchedBookingId: link?.bookingId || row.matchedBookingId,
                    },
                    bookingId
                  );
                  const reference = link?.reference || row.matchedReference;
                  const linkedId = link?.bookingId || row.matchedBookingId;
                  const category = pliantCategoryLabel(row.category || null);
                  const origin = originAmount(row);
                  const meta = [
                    formatDateFr(row.bookedAt),
                    pliantTypeLabel(row.type),
                    category,
                    row.holderName?.trim() || "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--admin-navy)]">{row.merchant?.trim() || "Dépense"}</p>
                        <p className="mt-1 text-xs text-muted">{meta}</p>
                        {row.comment?.trim() ? <p className="mt-1 text-xs text-muted">{row.comment.trim()}</p> : null}
                        <div className="mt-2">
                          <StatusChip tone={pliantStatusTone(row.status)}>{pliantStatusLabel(row.status)}</StatusChip>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="font-semibold tabular-nums text-[var(--admin-navy)]">
                          {amountLabel(row)}
                          {origin ? <span className="mt-0.5 block text-right text-xs font-normal text-muted">{origin}</span> : null}
                        </p>
                        <ReconcileAction
                          state={state}
                          reference={reference}
                          bookingId={linkedId}
                          several={choices.length > 1}
                          busy={busyId === row.id}
                          disabled={busyId != null}
                          onReconcile={() => {
                            if (choices.length > 1) {
                              setPicker({
                                transactionId: row.id,
                                bookingId,
                                title: row.merchant?.trim() || "Dépense",
                              });
                              return;
                            }
                            void post(row.id, choices[0]?.id || bookingId, "match");
                          }}
                          onRefuse={() => void post(row.id, bookingId, "refuse")}
                        />
                        <BusyBar active={busyId === row.id} label="Rapprochement…" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Aucune transaction sur cette carte.</p>
            )}
          </article>
        ))
      )}
      <StayPickDialog
        open={Boolean(picker)}
        stays={choices}
        currentId={bookingId}
        selectedId={picker?.bookingId || bookingId}
        title={picker?.title || "Dépense"}
        busy={busyId != null}
        onSelect={(id) => setPicker((current) => (current ? { ...current, bookingId: id } : current))}
        onConfirm={() => {
          if (!picker) return;
          void post(picker.transactionId, picker.bookingId, "match");
        }}
        onClose={() => {
          if (busyId) return;
          setPicker(null);
        }}
      />
    </section>
  );
}

function ReconcileAction({
  state,
  reference,
  bookingId,
  several,
  busy,
  disabled,
  onReconcile,
  onRefuse,
}: {
  state: ReturnType<typeof pliantReconcileState>;
  reference?: string | null;
  bookingId?: string | null;
  several: boolean;
  busy: boolean;
  disabled: boolean;
  onReconcile: () => void;
  onRefuse: () => void;
}) {
  if (state === "here") {
    return <p className="text-xs font-semibold text-[var(--admin-navy)]">Rapprochée{reference ? ` · ${reference}` : ""}</p>;
  }
  if (state === "elsewhere" && bookingId) {
    return (
      <p className="text-xs font-semibold text-[var(--admin-navy)]">
        Rapprochée ·{" "}
        <Link href={`/admin/reservations/${bookingId}?tab=reglement`} className="text-[#9e7e51] underline">
          {reference || "autre réservation"}
        </Link>
      </p>
    );
  }
  if (state === "ignored") return <p className="text-xs text-muted">Ignorée</p>;
  if (state !== "post" && state !== "attach") return null;
  const label =
    state === "attach"
      ? several
        ? "Lier à une réservation"
        : "Lier à ce séjour"
      : several
        ? "Rapprocher"
        : "Rapprocher sur ce séjour";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        disabled={disabled}
        className="rounded-full bg-[#0B192C] px-3 py-1.5 text-xs font-semibold text-[#faf9f6] disabled:opacity-50"
        onClick={onReconcile}
      >
        {busy ? "Rapprochement…" : label}
      </button>
      {state === "post" ? (
        <button
          type="button"
          disabled={disabled}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-50"
          onClick={onRefuse}
        >
          Refuser
        </button>
      ) : null}
    </div>
  );
}

function StayPickDialog({
  open,
  stays,
  currentId,
  selectedId,
  title,
  busy,
  onSelect,
  onConfirm,
  onClose,
}: {
  open: boolean;
  stays: PliantSettlementStay[];
  currentId: string;
  selectedId: string;
  title: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }
  const mounted = useIsClient();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return stays;
    return stays.filter((stay) => stay.label.toLocaleLowerCase("fr").includes(needle));
  }, [query, stays]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e4dc] bg-[#faf9f6] px-5 py-4">
          <div>
            <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
              Rapprocher sur une réservation
            </p>
            <p className="mt-0.5 text-sm text-[#44474c]">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-[#0b192c] hover:bg-[#f3f1ea]" aria-label="Fermer">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-[#e8e4dc] bg-white px-5 py-4">
          <label className="sr-only" htmlFor={`${titleId}-q`}>
            Rechercher une réservation
          </label>
          <input
            id={`${titleId}-q`}
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Référence, ville, titre…"
            className="admin-af-input w-full text-sm text-[#0b192c] placeholder:text-[#5c6370]"
            style={{ backgroundColor: "#f3f1ea", color: "#0b192c" }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2 py-2">
          {shown.length ? (
            <ul>
              {shown.map((stay) => {
                const selected = stay.id === selectedId;
                return (
                  <li key={stay.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(stay.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                        selected ? "bg-[#f3f1ea] ring-1 ring-[#c5a880]" : "hover:bg-[#f3f1ea]"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-[#0b192c]">{stay.label}</span>
                        {stay.id === currentId ? (
                          <span className="mt-0.5 block text-[12px] font-semibold text-[#9e7e51]">Ce séjour</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Aucune réservation pour cette recherche.</p>
          )}
        </div>
        <div className="border-t border-[#e8e4dc] bg-[#faf9f6] px-5 py-4">
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={onConfirm}
            className="admin-af-btn w-full rounded-full px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? "Rapprochement…" : "Valider"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
