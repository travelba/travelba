"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import {
  clientBoardingView,
  scopeBoardingOffer,
  type BoardingFileLink,
  type ClientBoardingCard,
  type ClientBoardingView,
} from "@/lib/crm/client-boarding-pass";
import { BOARDING_PASSES_READY_LABEL } from "@/lib/crm/flight-watch";

const OPEN_LABEL = "Voir mes cartes d’embarquement";

export function BoardingPassActions({
  variant,
  reference = "",
  itemIds = [],
  cards,
  full = [],
  badge = false,
  children,
}: {
  variant: "home" | "flight";
  reference?: string;
  itemIds?: string[];
  /** Déjà lues (aperçu). Sinon le clic interroge le séjour. */
  cards?: ClientBoardingCard[];
  full?: BoardingFileLink[];
  badge?: boolean;
  children?: (parts: { badge: ReactNode; button: ReactNode; sheet: ReactNode }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const preset = cards ? clientBoardingView(scopeBoardingOffer({ cards, full }, itemIds)) : null;
  const [fetched, setFetched] = useState<ClientBoardingView | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const titleId = useId();
  const view = preset || fetched;
  const volKey = itemIds.join(",");
  const hasPreset = cards != null;

  function openSheet() {
    if (!hasPreset && !fetched) setLoading(true);
    setFailed(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open || hasPreset || !reference) return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const id of volKey.split(",").filter(Boolean)) params.append("vol", id);
    const query = params.toString();
    fetch(`/api/mon-compte/sejours/${encodeURIComponent(reference)}/cartes${query ? `?${query}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("read");
        return (await response.json()) as ClientBoardingView;
      })
      .then((next) => {
        setFetched(next);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, hasPreset, reference, volKey]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const home = variant === "home";
  const badgeNode = badge ? (
    <button
      type="button"
      onClick={openSheet}
      className={
        home
          ? "mt-2 inline-flex rounded-full bg-[#C5A880]/20 px-2.5 py-1 text-left text-[11px] font-semibold text-[#C5A880]"
          : "inline-flex rounded-full bg-[#C5A880]/20 px-2.5 py-1 text-left text-[11px] font-semibold text-[var(--admin-navy)]"
      }
    >
      {BOARDING_PASSES_READY_LABEL}
    </button>
  ) : null;
  const buttonNode = (
    <button
      type="button"
      onClick={openSheet}
      className={
        home
          ? "inline-flex h-11 w-full items-center justify-center rounded-full bg-[#C5A880] px-4 text-sm font-semibold text-[#0B192C]"
          : "inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white"
      }
    >
      {OPEN_LABEL}
    </button>
  );
  const sheet = open ? (
    <BoardingSheet
      titleId={titleId}
      view={view}
      loading={loading && !view}
      failed={failed}
      onClose={() => setOpen(false)}
    />
  ) : null;

  if (children) return children({ badge: badgeNode, button: buttonNode, sheet });
  return (
    <div className="space-y-2">
      {badgeNode}
      {buttonNode}
      {sheet}
    </div>
  );
}

function BoardingSheet({
  titleId,
  view,
  loading,
  failed,
  onClose,
}: {
  titleId: string;
  view: ClientBoardingView | null;
  loading: boolean;
  failed: boolean;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const cards = view?.cards || [];
  const full = view?.full || [];
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0B192C]/55 p-3 pb-24 sm:items-center sm:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5e3dc] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">Vol</p>
            <h2 id={titleId} className="font-display text-lg font-bold text-[#0B192C]">
              Cartes d’embarquement
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[#0B192C]" aria-label="Fermer">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 overflow-auto px-4 py-3">
          {loading ? <p className="text-sm text-muted">Chargement…</p> : null}
          {failed ? (
            <p className="text-sm text-[var(--admin-navy)]">
              Les cartes d’embarquement ne sont pas disponibles pour le moment.
            </p>
          ) : null}
          {!loading && !failed && !cards.length && !full.length ? (
            <p className="text-sm text-muted">Aucune carte d’embarquement à ouvrir.</p>
          ) : null}
          {cards.map((card) => (
            <a
              key={card.key}
              href={card.href}
              target={card.href.startsWith("/api/") ? "_blank" : undefined}
              rel={card.href.startsWith("/api/") ? "noopener noreferrer" : undefined}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--admin-navy)]">
                  {card.firstName || "Carte d’embarquement"}
                </span>
                <span className="block truncate text-xs text-muted">
                  {[card.flight, card.seat ? `Siège ${card.seat}` : "", card.route].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[var(--admin-navy)]">Ouvrir</span>
            </a>
          ))}
          {full.map((file) => (
            <a
              key={file.href}
              href={file.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#C5A880] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]"
            >
              <span>{file.label}</span>
              <span>Ouvrir</span>
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
