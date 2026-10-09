"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";
import { staffRoleLabel, type StaffRole } from "@/lib/crm/staff-team";
import {
  ADMIN_MOBILE_TABS,
  adminNavBadge,
  mobileTabActive,
  mobileTabBadge,
  staffInitials,
  type AdminNavCounts,
  type AdminNavGroup,
} from "@/lib/crm/admin-nav";

/** Pastille or des compteurs du menu. */
export function NavBadge({ value, className = "" }: { value: number | null; className?: string }) {
  if (value == null) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--admin-gold)] px-1.5 py-0.5 font-label text-[10px] font-bold leading-none text-[var(--admin-navy)] ${className}`}
    >
      {value}
    </span>
  );
}

/**
 * Groupes du menu agence : en-tête repliable (`aria-expanded`), liens avec `aria-current="page"`.
 * Sans hook de navigation : la page courante et les compteurs arrivent en props.
 */
export function SidebarGroups({
  groups,
  activeHref,
  counts,
  openIds,
  onToggle,
  onNavigate,
  variant = "dark",
  ariaLabel = "Menu agence",
}: {
  groups: AdminNavGroup[];
  activeHref: string | null;
  counts: AdminNavCounts;
  openIds: string[];
  onToggle: (groupId: string) => void;
  onNavigate?: () => void;
  variant?: "dark" | "light";
  ariaLabel?: string;
}) {
  const dark = variant === "dark";
  const open = new Set(openIds);
  return (
    <nav aria-label={ariaLabel} className="flex flex-col gap-3">
      {groups.map((group) => {
        const expanded = open.has(group.id);
        const listId = `admin-nav-${group.id}`;
        const groupBadge = group.items.reduce((sum, item) => sum + (adminNavBadge(item, counts) || 0), 0);
        return (
          <section key={group.id} aria-labelledby={`${listId}-titre`}>
            <button
              type="button"
              id={`${listId}-titre`}
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => onToggle(group.id)}
              className={`admin-tap flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 font-label text-[11px] font-bold uppercase tracking-[0.16em] ${
                dark ? "text-[var(--admin-gold)] hover:bg-white/5" : "text-[#9e7e51] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span>{group.label}</span>
              <span className="flex items-center gap-1.5">
                {!expanded && groupBadge > 0 ? <NavBadge value={groupBadge} /> : null}
                <Icon
                  name="expand_more"
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`}
                />
              </span>
            </button>
            <ul id={listId} hidden={!expanded} className="mt-1 flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const badge = adminNavBadge(item, counts);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noreferrer" : undefined}
                      className={`admin-tap flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                        dark
                          ? active
                            ? "bg-white/10 font-semibold text-[var(--admin-gold)]"
                            : "text-[#c5c6cd] hover:bg-white/5 hover:text-white"
                          : active
                            ? "bg-[var(--admin-navy)] font-semibold text-[var(--admin-gold-soft)]"
                            : "text-[var(--admin-navy)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.newTab ? <span aria-hidden className="text-xs opacity-60">↗</span> : null}
                      </span>
                      <NavBadge value={badge} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

/** Avatar qui ouvre le menu utilisateur : nom, rôle, WhatsApp agence, Déconnexion (D-25). */
export function UserMenu({
  name,
  role,
  onSignOut,
  variant = "light",
  align = "right",
}: {
  name: string;
  role?: StaffRole | "";
  onSignOut: () => void | Promise<void>;
  variant?: "dark" | "light";
  align?: "left" | "right";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    const timer = window.setTimeout(() => firstItemRef.current?.focus(), 10);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.clearTimeout(timer);
    };
  }, [open]);

  const dark = variant === "dark";
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={name ? `Menu de ${name}` : "Menu utilisateur"}
        onClick={() => setOpen((value) => !value)}
        className={`admin-tap inline-flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold ${
          dark
            ? "bg-white/10 text-[var(--admin-gold)] ring-1 ring-[var(--admin-gold)]/40"
            : "bg-[var(--admin-navy)] text-[var(--admin-gold)]"
        }`}
      >
        {staffInitials(name)}
      </button>
      {open ? (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label="Menu utilisateur"
          className={`absolute top-12 z-[60] w-64 overflow-hidden rounded-2xl border border-[var(--border)] bg-white text-[var(--admin-navy)] shadow-[0_18px_50px_rgba(11,25,44,0.18)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <p className="truncate font-display text-sm font-bold">
              {name || (role === "partner" ? "MyLER partner" : "Agent connecté")}
            </p>
            {role ? <p className="text-xs text-muted">{role === "partner" ? "MyLER partner" : staffRoleLabel(role)}</p> : null}
          </div>
          {role === "partner" ? null : (
          <a
            ref={(node) => {
              firstItemRef.current = node;
            }}
            role="menuitem"
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="admin-tap flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            <Icon name="support_agent" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
            WhatsApp agence
          </a>
          )}
          <button
            type="button"
            role="menuitem"
            ref={
              role === "partner"
                ? (node) => {
                    firstItemRef.current = node;
                  }
                : undefined
            }
            onClick={() => {
              setOpen(false);
              void onSignOut();
            }}
            className="admin-tap flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            <Icon name="logout" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
            {role === "partner" ? "Sign out" : "Déconnexion"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Barre basse téléphone : cinq entrées, « Plus » ouvre la feuille (D-09). */
export function MobileTabBar({
  pathname,
  counts,
  moreOpen,
  onMore,
}: {
  pathname: string;
  counts: AdminNavCounts;
  moreOpen: boolean;
  onMore: () => void;
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--admin-gold)]/40 bg-[var(--admin-navy)] pb-[env(safe-area-inset-bottom)] text-[#c5c6cd] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {ADMIN_MOBILE_TABS.map((tab) => {
          const active = !moreOpen && mobileTabActive(tab, pathname);
          const badge = mobileTabBadge(tab, counts);
          const className = `admin-tap relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
            active || (tab.id === "plus" && moreOpen) ? "text-[var(--admin-gold)]" : "text-[#c5c6cd]"
          }`;
          const body = (
            <>
              <span className="relative">
                <Icon name={tab.icon} className="h-5 w-5" />
                {badge != null ? <NavBadge value={badge} className="absolute -right-3 -top-2" /> : null}
              </span>
              <span>{tab.label}</span>
            </>
          );
          return (
            <li key={tab.id}>
              {tab.href ? (
                <Link href={tab.href} aria-current={active ? "page" : undefined} className={className}>
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  aria-controls="admin-more-sheet"
                  aria-current={active ? "page" : undefined}
                  onClick={onMore}
                  className={`${className} w-full`}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Piège de focus simple : Tab boucle dans le panneau, Escape ferme, le focus revient au déclencheur. */
export function useDialogFocus(open: boolean, panelRef: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    const timer = window.setTimeout(() => (first || panel)?.focus(), 10);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => !node.hasAttribute("hidden") && node.offsetParent !== null
      );
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, panelRef]);
}

/** Feuille basse « Plus » du téléphone : boîtes, outils, équipe, puis l’utilisateur (D-09). */
export function MoreSheet({
  open,
  groups,
  activeHref,
  counts,
  name,
  role,
  onClose,
  onSignOut,
}: {
  open: boolean;
  groups: AdminNavGroup[];
  activeHref: string | null;
  counts: AdminNavCounts;
  name: string;
  role?: StaffRole | "";
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(open, panelRef, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end bg-[#0b192c]/55 lg:hidden"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id="admin-more-sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-[#faf9f6] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-[var(--admin-navy)] shadow-[0_-18px_50px_rgba(11,25,44,0.3)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <p id={titleId} className="font-display text-base font-bold">
            Plus
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-full"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2">
          <SidebarGroups
            groups={groups}
            activeHref={activeHref}
            counts={counts}
            openIds={groups.map((group) => group.id)}
            onToggle={() => {}}
            onNavigate={onClose}
            variant="light"
            ariaLabel="Autres pages"
          />
        </div>
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-[var(--admin-gold)]">
              {staffInitials(name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold">{name || "Agent connecté"}</span>
              {role ? <span className="block text-xs text-muted">{staffRoleLabel(role)}</span> : null}
            </span>
          </div>
          <a
            href={`https://wa.me/${siteConfig.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="admin-tap flex items-center gap-2 px-4 py-3 text-sm font-medium"
          >
            <Icon name="support_agent" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
            WhatsApp agence
          </a>
          <button
            type="button"
            onClick={() => {
              onClose();
              void onSignOut();
            }}
            className="admin-tap flex w-full items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-left text-sm font-medium"
          >
            <Icon name="logout" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}

/** Recherche en plein écran sur téléphone : la loupe l’ouvre, le clavier arrive tout de suite. */
export function SearchOverlay({
  open,
  initialQuery,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onSubmit: (query: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  useDialogFocus(open, panelRef, onClose);
  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Rechercher"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--admin-navy)] pt-[env(safe-area-inset-top)] text-white lg:hidden"
    >
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(query.trim());
        }}
        className="flex items-center gap-2 px-3 py-3"
      >
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c5c6cd]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-md bg-white/10 py-3 pl-10 pr-4 text-[15px] text-white outline-none placeholder:text-[#c5c6cd] focus:bg-white/15 focus:ring-2 focus:ring-[var(--admin-gold)]/40"
            placeholder="Client, référence TB-, hôtel, confirmation…"
            aria-label="Rechercher un client ou un dossier"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <button type="submit" className="admin-af-btn-accent admin-tap rounded-md px-3 py-2.5 text-sm">
          Chercher
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la recherche"
          className="admin-tap inline-flex h-11 w-11 items-center justify-center rounded-lg"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </form>
      <p className="px-4 text-sm text-[#c5c6cd]">
        Un nom ouvre la fiche. Une référence, un hôtel ou une confirmation ouvre le dossier.
      </p>
    </div>
  );
}
