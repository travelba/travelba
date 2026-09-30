"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/crm/icons";
import type { AddressHit } from "@/lib/crm/address-suggest";

export function AddressSuggest({
  label,
  value,
  onChange,
  readOnly,
  near,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  near?: string | null;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [hits, setHits] = useState<AddressHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [empty, setEmpty] = useState(false);
  const placeholder = label === "Arrivée" ? "Adresse d’arrivée" : "Adresse de départ";

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function pick(hit: AddressHit) {
    onChange(hit.label);
    setHits([]);
    setEmpty(false);
    setOpen(false);
  }

  function search(query: string) {
    onChange(query);
    if (timer.current) window.clearTimeout(timer.current);
    abort.current?.abort();
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setEmpty(false);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      const params = new URLSearchParams({ q });
      if (near?.trim()) params.set("near", near.trim());
      void fetch(`/api/addresses?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { hits: [] }))
        .then((json: { hits?: AddressHit[] }) => {
          if (controller.signal.aborted) return;
          const rows = Array.isArray(json.hits) ? json.hits : [];
          setHits(rows);
          setEmpty(rows.length === 0);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setHits([]);
          setEmpty(true);
          setOpen(true);
        });
    }, 160);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "ArrowDown" && hits.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(hits.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp" && hits.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter" && open && hits[active]) {
      event.preventDefault();
      pick(hits[active]);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">{label}</span>
      {readOnly ? (
        <p className="mt-1 break-words text-sm text-[var(--admin-navy)]">{value || "—"}</p>
      ) : (
        <div ref={root} className="relative mt-1">
          <textarea
            ref={field}
            rows={2}
            value={value}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && (hits.length > 0 || empty)}
            aria-controls={listId}
            aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
            onChange={(event) => search(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (hits.length || empty) setOpen(true);
            }}
            aria-label={label}
            placeholder={placeholder}
            autoComplete="off"
            className="w-full resize-none overflow-hidden rounded-xl border border-border bg-white px-3 py-2 pr-9 text-sm leading-5 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-navy)]"
          />
          {value.trim() ? (
            <button
              type="button"
              aria-label={`Effacer ${label.toLocaleLowerCase("fr")}`}
              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-[#f3f6fa] hover:text-[var(--admin-navy)]"
              onMouseDown={(event) => {
                event.preventDefault();
                search("");
                field.current?.focus();
              }}
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {open && (hits.length > 0 || empty) ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-2xl border border-[#e5e3dc] bg-white py-1 shadow-[0_16px_40px_rgba(11,25,44,0.16)]"
            >
              {hits.map((hit, index) => (
                <li key={hit.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2.5 px-2.5 py-2 text-left ${
                      index === active ? "bg-[#f3f6fa]" : "bg-white"
                    }`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(hit);
                    }}
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[var(--admin-navy)]">
                      <Icon name="pin" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug text-[var(--admin-navy)]">
                        {hit.title}
                      </span>
                      {hit.subtitle ? <span className="block text-xs leading-snug text-muted">{hit.subtitle}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
              {empty ? (
                <li className="px-3 py-2.5 text-sm text-muted">Aucune adresse. Votre saisie est conservée.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </label>
  );
}
