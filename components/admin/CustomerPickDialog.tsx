"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import { useIsClient } from "@/lib/crm/use-is-client";
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
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const [query, setQuery] = useState("");
  const mounted = useIsClient();
  // Chaque ouverture repart d’une recherche vide (au rendu, pas dans un effet).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  useEffect(() => {
    if (!open) return;
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
              {title}
            </p>
            <p className="mt-0.5 text-sm text-[#44474c]">
              Tapez un nom, une société, un e-mail ou un téléphone.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#0b192c] hover:bg-[#f3f1ea]"
            aria-label="Fermer"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-[#e8e4dc] bg-white px-5 py-4">
          <label className="sr-only" htmlFor={`${titleId}-q`}>
            Rechercher un client
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#44474c]"
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
              className="admin-af-input w-full text-sm text-[#0b192c] placeholder:text-[#5c6370]"
              style={{ paddingLeft: "2.75rem", backgroundColor: "#f3f1ea", color: "#0b192c" }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-2 py-2">
          {!customers.length ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Aucun client dans le CRM.</p>
          ) : !suggested.length && !rest.length ? (
            <p className="px-3 py-8 text-center text-sm text-[#44474c]">Aucun client pour cette recherche.</p>
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
        <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
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
        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
          selected ? "bg-[#f3f1ea] ring-1 ring-[#c5a880]" : "hover:bg-[#f3f1ea]"
        }`}
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b192c] text-[12px] font-bold tracking-wide text-[#faf9f6]">
          {[customer.first_name?.[0], customer.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
            "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold leading-tight text-[#0b192c]">
              {customerPickLabel(customer)}
            </span>
            {proposed ? (
              <span className="rounded-full bg-[#f5ece0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0b192c]">
                Proposition
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] leading-snug text-[#44474c]">
            {[customer.email, customer.phone].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
      </button>
    </li>
  );
}
