"use client";

import { FormEvent, useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/crm/icons";
import {
  OMNIBAR_DEBOUNCE_MS,
  OMNIBAR_GROUPS,
  emptyOmnibar,
  flattenOmnibar,
  omnibarNeedle,
  omnibarOnKey,
  readOmnibarPayload,
  type OmnibarGroupId,
  type OmnibarHit,
  type OmnibarPayload,
} from "@/lib/crm/omnibar";

const GROUP_ICON: Record<OmnibarGroupId, "person" | "luggage" | "group"> = {
  clients: "person",
  dossiers: "luggage",
  voyageurs: "group",
};

const menuClass =
  "overflow-auto rounded-2xl border border-[#e5e3dc] bg-white py-1 text-[var(--admin-navy)] shadow-[0_16px_40px_rgba(11,25,44,0.16)]";

export function OmnibarMenu({
  listId,
  payload,
  loading,
  error,
  activeIndex,
  onPick,
  onHover,
  className = "",
}: {
  listId: string;
  payload: OmnibarPayload;
  loading: boolean;
  error: string;
  activeIndex: number;
  onPick: (hit: OmnibarHit) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  const flat = flattenOmnibar(payload);
  const showEmpty = !loading && !error && flat.length === 0;
  const sections = OMNIBAR_GROUPS.flatMap((group, groupIndex, groups) => {
    const rows = payload[group.id];
    if (!rows.length) return [];
    const offset = groups
      .slice(0, groupIndex)
      .reduce((sum, item) => sum + payload[item.id].length, 0);
    return [{ group, rows, offset }];
  });

  return (
    <ul id={listId} role="listbox" aria-label="Suggestions" className={`${menuClass} ${className}`}>
      {loading && flat.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Recherche…</li> : null}
      {error ? <li className="px-3 py-2 text-sm text-accent">{error}</li> : null}
      {showEmpty ? (
        <li className="px-3 py-2 text-sm text-muted">Aucun client, dossier ni voyageur.</li>
      ) : null}
      {sections.map(({ group, rows, offset }) => {
        return (
          <li key={group.id}>
            <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              {group.label}
            </p>
            <ul>
              {rows.map((hit, rowIndex) => {
                const index = offset + rowIndex;
                const active = index === activeIndex;
                return (
                  <li key={`${group.id}-${hit.id}`} id={`${listId}-${index}`} role="option" aria-selected={active}>
                    <button
                      type="button"
                      className={`flex w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left ${
                        active ? "bg-[#f3f6fa]" : "bg-white"
                      }`}
                      onMouseEnter={() => onHover(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        onPick(hit);
                      }}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6f1e8] text-[var(--admin-navy)]">
                        <Icon name={GROUP_ICON[group.id]} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[var(--admin-navy)]">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-xs text-muted">{hit.subtitle}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminOmnibar({
  value,
  initialValue = "",
  onValueChange,
  onSubmit,
  onNavigate,
  onClose,
  variant = "header",
  highlighted = false,
  autoFocus = false,
}: {
  value?: string;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit: (query: string) => void;
  onNavigate: (href: string) => void;
  onClose?: () => void;
  variant?: "header" | "overlay";
  highlighted?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [draft, setDraft] = useState(initialValue);
  const text = value ?? draft;
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<OmnibarPayload>(emptyOmnibar());
  const [active, setActive] = useState(-1);
  const needle = omnibarNeedle(text);
  const flat = flattenOmnibar(payload);
  const showList = open && Boolean(needle) && (loading || searched || Boolean(error));

  function setText(next: string) {
    if (value === undefined) setDraft(next);
    onValueChange?.(next);
    setActive(-1);
    setPayload(emptyOmnibar());
    setSearched(false);
    setError("");
    if (omnibarNeedle(next)) {
      setOpen(true);
      setLoading(true);
    } else {
      setOpen(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!focused || !needle) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      setOpen(true);
      void fetch(`/api/admin/recherche?q=${encodeURIComponent(needle)}`, { signal: ctrl.signal })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(typeof json.error === "string" ? json.error : "Recherche indisponible. Réessayez.");
          }
          if (ctrl.signal.aborted) return;
          setPayload(readOmnibarPayload(json));
          setSearched(true);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          setPayload(emptyOmnibar());
          setSearched(true);
          setError(err instanceof Error ? err.message : "Recherche indisponible. Réessayez.");
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, OMNIBAR_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [focused, needle]);

  useEffect(() => {
    if (!showList || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [showList, active, listId]);

  function pick(hit: OmnibarHit) {
    setOpen(false);
    onNavigate(hit.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const action = omnibarOnKey(event.key, { open: showList, count: flat.length, index: active });
    if (action.type === "move") {
      event.preventDefault();
      setOpen(true);
      setActive(action.index);
    } else if (action.type === "pick") {
      event.preventDefault();
      const hit = flat[action.index];
      if (hit) pick(hit);
    } else if (action.type === "close") {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(text.trim());
  }

  const input = (
    <div className={variant === "overlay" ? "relative min-w-0 flex-1" : "relative"}>
      <Icon
        name="search"
        className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 ${
          variant === "overlay" ? "text-[#c5c6cd]" : "text-muted"
        }`}
      />
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => {
          setFocused(true);
          if (omnibarNeedle(text)) {
            setOpen(true);
            setLoading(true);
          }
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
          setLoading(false);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label="Rechercher un client, un dossier ou un voyageur"
        aria-current={highlighted ? "page" : undefined}
        placeholder="Client, voyageur, référence TB-, hôtel…"
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
        enterKeyHint="search"
        type="search"
        className={
          variant === "overlay"
            ? "w-full rounded-md bg-white/10 py-3 pl-10 pr-4 text-[15px] text-white outline-none placeholder:text-[#c5c6cd] focus:bg-white/15 focus:ring-2 focus:ring-[var(--admin-gold)]/40"
            : `w-full rounded-md py-2.5 pl-10 pr-4 text-[13px] text-[var(--admin-navy)] outline-none transition focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30 ${
                highlighted ? "bg-white ring-2 ring-[var(--admin-gold)]/60" : "bg-[var(--surface-2)]"
              }`
        }
      />
    </div>
  );

  let trailing: ReactNode = null;
  if (variant === "overlay") {
    trailing = (
      <>
        <button type="submit" className="admin-af-btn-accent admin-tap rounded-md px-3 py-2.5 text-sm">
          Chercher
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-lg text-white"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </>
    );
  }

  return (
    <div className={variant === "overlay" ? "flex min-h-0 flex-1 flex-col" : "relative w-full max-w-xl"}>
      <form
        role="search"
        onSubmit={onFormSubmit}
        className={variant === "overlay" ? "flex items-center gap-2" : undefined}
      >
        {input}
        {trailing}
      </form>
      {showList ? (
        <OmnibarMenu
          listId={listId}
          payload={payload}
          loading={loading}
          error={error}
          activeIndex={active}
          onPick={pick}
          onHover={setActive}
          className={
            variant === "overlay" ? "mt-3 min-h-0 flex-1" : "absolute top-full z-50 mt-1 max-h-80 w-full"
          }
        />
      ) : variant === "overlay" ? (
        <p className="px-1 pt-4 text-sm text-[#c5c6cd]">
          Dès deux lettres, les clients, dossiers et voyageurs s’affichent. Entrée sans choix ouvre la recherche
          complète.
        </p>
      ) : null}
    </div>
  );
}
