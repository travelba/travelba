"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { BusyBar } from "@/components/crm/BusyBar";
import { fieldControlClass } from "@/components/crm/fields";
import { Icon } from "@/components/crm/icons";

type CoverHit = {
  id: string;
  title: string;
  thumb: string;
  credit: string | null;
};

export function CoverPickDialog({
  open,
  bookingId,
  place,
  busy,
  notice,
  onClose,
  onPick,
  onFile,
}: {
  open: boolean;
  bookingId: string;
  place: string;
  busy: boolean;
  notice?: string | null;
  onClose: () => void;
  onPick: (photoId: string) => void;
  onFile: (file: File) => void;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(place);
  const [photos, setPhotos] = useState<CoverHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(place);
    setPhotos([]);
    setError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focus);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setPhotos([]);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/bookings/${bookingId}/cover/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPhotos([]);
          setError(typeof json.error === "string" ? json.error : "Recherche impossible.");
          return;
        }
        setPhotos(Array.isArray(json.photos) ? json.photos : []);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setPhotos([]);
        setError("Recherche impossible.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, bookingId]);

  if (!open || !mounted) return null;

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    onFile(file);
  }

  const placeLabel = place || "la ville";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--admin-navy)]/50 p-3 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p id={titleId} className="font-display text-lg font-bold text-[var(--admin-navy)]">
              Importer une photo
            </p>
            <p className="text-sm text-muted">
              Recherchez une photo de {placeLabel}, puis sélectionnez-la.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1.5 text-muted hover:bg-[var(--admin-sky)] disabled:opacity-50"
            aria-label="Fermer"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <label className="block text-sm font-semibold text-[var(--admin-navy)]" htmlFor={`${titleId}-q`}>
            Ville ou lieu
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
              placeholder="Marrakech, Avoriaz…"
              className={`${fieldControlClass} pl-9`}
              disabled={busy}
            />
          </div>
          {loading || busy ? (
            <BusyBar active label={busy ? "Import de la photo…" : "Recherche…"} />
          ) : null}
          {notice || error ? <p className="text-sm text-accent">{notice || error}</p> : null}
          {!loading && !error && query.trim().length >= 2 && photos.length === 0 ? (
            <p className="text-sm text-muted">Aucune photo pour cette recherche. Essayez un autre nom, ou importez un fichier.</p>
          ) : null}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPick(photo.id)}
                  className="group block w-full overflow-hidden rounded-2xl border border-border text-left disabled:opacity-50"
                  aria-label={photo.title}
                >
                  <img
                    src={photo.thumb}
                    alt=""
                    className="aspect-video w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-[var(--admin-navy)]">
                    {photo.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <label className="cursor-pointer rounded-full bg-[var(--admin-navy)] px-3 py-1.5 text-xs font-semibold text-white">
            Depuis l’ordinateur
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={chooseFile}
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm font-semibold text-muted disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
