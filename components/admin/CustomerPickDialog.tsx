"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import {
  customerPickLabel,
  filterCustomersForPick,
  type PickableCustomer,
} from "@/lib/crm/customer-search";

export function CustomerPickDialog({
  open,
  customers,
  suggestedIds = [],
  selectedId = "",
  title = "Choisir un client",
  onSelect,
  onClose,
}: {
  open: boolean;
  customers: PickableCustomer[];
  suggestedIds?: string[];
  selectedId?: string;
  title?: string;
  onSelect: (customer: PickableCustomer) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { suggested, rest } = useMemo(
    () => filterCustomersForPick(customers, query, suggestedIds),
    [customers, query, suggestedIds]
  );
  const first = suggested[0] || rest[0] || null;

  if (!open || !mounted) return null;

  function pick(customer: PickableCustomer) {
    onSelect(customer);
    onCloseRef.current();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--admin-navy)]/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p id={titleId} className="font-display text-lg font-bold text-[var(--admin-navy)]">
              {title}
            </p>
            <p className="text-sm text-muted">Tapez un nom, une société, un e-mail ou un téléphone.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted hover:bg-[var(--admin-sky)]"
            aria-label="Fermer"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <label className="sr-only" htmlFor={`${titleId}-q`}>
            Rechercher un client
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <input
              id={`${titleId}-q`}
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && first) {
                  event.preventDefault();
                  pick(first);
                }
              }}
              placeholder="Rechercher un client…"
              className="admin-af-input w-full pl-10 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {!customers.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Aucun client dans le CRM.</p>
          ) : !suggested.length && !rest.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted">Aucun client pour cette recherche.</p>
          ) : (
            <>
              {suggested.length ? (
                <Section heading="Propositions">
                  {suggested.map((c) => (
                    <CustomerRow
                      key={c.id}
                      customer={c}
                      selected={c.id === selectedId}
                      proposed
                      onPick={pick}
                    />
                  ))}
                </Section>
              ) : null}
              {rest.length ? (
                <Section heading={suggested.length ? "Tous les clients" : undefined}>
                  {rest.map((c) => (
                    <CustomerRow
                      key={c.id}
                      customer={c}
                      selected={c.id === selectedId}
                      onPick={pick}
                    />
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-2">
      {heading ? (
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          {heading}
        </p>
      ) : null}
      <ul>{children}</ul>
    </div>
  );
}

function CustomerRow({
  customer,
  selected,
  proposed = false,
  onPick,
}: {
  customer: PickableCustomer;
  selected: boolean;
  proposed?: boolean;
  onPick: (customer: PickableCustomer) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(customer)}
        className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left ${
          selected ? "bg-[var(--admin-sky)]" : "hover:bg-[var(--admin-sky)]/60"
        }`}
      >
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[#f8f6f0]">
          {[customer.first_name?.[0], customer.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
            "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--admin-navy)]">
              {customerPickLabel(customer)}
            </span>
            {proposed ? (
              <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)]">
                Proposition
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted">
            {[customer.email, customer.phone].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      </button>
    </li>
  );
}
