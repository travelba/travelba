"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AgencyLogo } from "@/components/AgencyLogo";
import { NavBadge, UserMenu, useDialogFocus } from "@/components/admin/AdminNavParts";
import { Icon } from "@/components/crm/icons";
import { createClient } from "@/lib/supabase/client";
import { REFONTE_MENU, REFONTE_PREFIX, refonteActiveHref, type SearchHit } from "@/lib/crm/refonte-preview";

function fold(value: string) {
  return value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{M}/gu, "");
}

export function RefonteShell({
  staffName,
  staffRole,
  hits,
  taskCount,
  messageCount,
  children,
}: {
  staffName: string;
  staffRole: "admin" | "agent" | "partner" | "";
  hits: SearchHit[];
  taskCount: number;
  messageCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = refonteActiveHref(pathname);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const page = REFONTE_MENU.find((item) => item.href === active)?.label || "Aperçu";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setActiveIndex(0);
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const badge = (href: string) => {
    if (href === REFONTE_PREFIX) return taskCount > 0 ? taskCount : null;
    if (href.endsWith("/messages")) return messageCount > 0 ? messageCount : null;
    return null;
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-[var(--admin-navy)] pt-[env(safe-area-inset-top)] text-white lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Link href={REFONTE_PREFIX} aria-label="Aujourd’hui" className="shrink-0">
              <AgencyLogo className="h-9 w-9" />
            </Link>
            <p className="truncate font-display text-sm font-semibold">{page}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Rechercher"
              aria-expanded={open}
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
                setOpen(true);
              }}
              className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-lg text-white"
            >
              <Icon name="search" className="h-5 w-5" />
            </button>
            <UserMenu name={staffName} role={staffRole} onSignOut={signOut} variant="dark" />
          </div>
        </div>
      </header>

      <aside
        aria-label="Refonte de l’espace agence"
        className="z-50 hidden w-72 flex-col bg-[var(--admin-navy)] px-5 py-6 text-white lg:fixed lg:left-0 lg:top-0 lg:flex lg:h-full"
      >
        <Link href={REFONTE_PREFIX} className="flex items-center gap-3 px-1">
          <AgencyLogo className="h-10 w-10" />
          <span className="flex flex-col leading-tight">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              Travel Business
            </span>
            <span className="text-sm font-medium text-[#dbe5f6]">Aperçu refonte</span>
          </span>
        </Link>
        <nav aria-label="Menu refonte" className="mt-6 flex flex-col gap-1">
          {REFONTE_MENU.map((item) => {
            const current = item.href === active;
            const count = badge(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`admin-tap flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                  current ? "bg-white/10 font-semibold text-[var(--admin-gold)]" : "text-[#c5c6cd] hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </span>
                <NavBadge value={count} />
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-3 pt-6 text-[11px] leading-relaxed text-[#9eafc6]">
          Six entrées, à la place des sept groupes. Outils et Équipe sont dans Agence.
        </p>
        <Link href="/admin" className="mt-3 px-3 text-sm font-semibold text-[var(--admin-gold)]">
          Revenir à l’agence
        </Link>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 hidden h-20 items-center justify-between border-b border-[var(--border)] bg-[rgba(250,249,246,0.9)] px-8 shadow-[0_1px_8px_rgba(11,25,44,0.04)] backdrop-blur-xl lg:flex">
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveIndex(0);
              setOpen(true);
            }}
            className="admin-af-input flex h-12 w-full max-w-xl items-center gap-3 text-left text-sm text-muted"
          >
            <Icon name="search" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
            <span className="flex-1">Rechercher un client, un dossier, un message</span>
            <kbd className="rounded-md border border-[var(--border)] bg-white px-1.5 py-0.5 font-label text-[10px] font-bold text-[var(--admin-navy)]">
              ⌘K
            </kbd>
          </button>
          <div className="ml-6 flex items-center gap-4">
            <UserMenu name={staffName} role={staffRole} onSignOut={signOut} />
          </div>
        </header>
        <main className="min-w-0 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-8 lg:pt-8">
          <p className="mb-6 rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm text-[var(--admin-navy)]">
            Aperçu de la refonte. Lecture seule : les boutons n’écrivent rien et n’envoient aucun message.
          </p>
          {children}
        </main>
      </div>

      <nav
        aria-label="Navigation refonte"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--admin-gold)]/40 bg-[var(--admin-navy)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {REFONTE_MENU.map((item) => {
            const current = item.href === active;
            const count = badge(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  className={`admin-tap relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                    current ? "text-[var(--admin-gold)]" : "text-[#c5c6cd]"
                  }`}
                >
                  <span className="relative">
                    <Icon name={item.icon} className="h-5 w-5" />
                    {count != null ? <NavBadge value={count} className="absolute -right-3 -top-2" /> : null}
                  </span>
                  <span className="max-w-full truncate px-0.5">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <CommandPalette
        open={open}
        hits={hits}
        query={query}
        activeIndex={activeIndex}
        onQuery={(value) => {
          setQuery(value);
          setActiveIndex(0);
        }}
        onActive={setActiveIndex}
        onClose={() => setOpen(false)}
        onPick={go}
      />
    </>
  );
}

function CommandPalette({
  open,
  hits,
  query,
  activeIndex,
  onQuery,
  onActive,
  onClose,
  onPick,
}: {
  open: boolean;
  hits: SearchHit[];
  query: string;
  activeIndex: number;
  onQuery: (value: string) => void;
  onActive: (index: number) => void;
  onClose: () => void;
  onPick: (href: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useDialogFocus(open, panelRef, onClose);

  const results = useMemo(() => {
    const needle = fold(query.trim());
    const rows = needle ? hits.filter((hit) => fold(`${hit.label} ${hit.hint}`).includes(needle)) : hits.slice(0, 8);
    return rows.slice(0, 12);
  }, [hits, query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[#0b192c]/55 px-3 pt-[12vh]" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        tabIndex={-1}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white text-[var(--admin-navy)] shadow-[0_16px_40px_rgba(11,25,44,0.16)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
          <Icon name="search" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Client, dossier, message"
            aria-controls={listId}
            aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onActive(Math.min(results.length - 1, activeIndex + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                onActive(Math.max(0, activeIndex - 1));
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                onPick(results[activeIndex].href);
              }
            }}
          />
        </div>
        <ul id={listId} role="listbox" aria-label="Résultats" className="max-h-80 overflow-auto py-1">
          {results.length ? (
            results.map((hit, index) => (
              <li key={hit.id} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => onActive(index)}
                  onClick={() => onPick(hit.href)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
                    index === activeIndex ? "bg-[var(--admin-sky)]" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{hit.label}</span>
                    <span className="block truncate text-xs text-muted">{hit.hint}</span>
                  </span>
                  <span className="shrink-0 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
                    {hit.kind === "client" ? "Client" : hit.kind === "dossier" ? "Dossier" : "Message"}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-sm text-muted">Aucun résultat dans l’aperçu.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
