"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import { photoCountLabel, type HotelPhoto } from "@/lib/crm/hotel-gallery";

function scrollGallery(el: HTMLDivElement | null, index: number, delta: number, count: number) {
  if (!el || !el.clientWidth) return;
  const next = Math.min(count - 1, Math.max(0, index + delta));
  el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
}

/** Galerie de la chambre, ou de l’hôtel si la chambre n’a pas de photo. */
export function HotelGallery({ photos, title }: { photos: HotelPhoto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const photo = photos[index] || photos[0];
  if (!photo) return null;
  const badge = photo.caption || (photo.kind === "room" ? "Chambre" : "L’hôtel");

  return (
    <div className="bg-[#0B192C]">
      <div className="relative aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element -- photo catalogue Little Emperors, hors next/image */}
        <img
          src={photo.url}
          alt={photo.caption ? `${title}, ${photo.caption}` : title}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
        <p className="absolute bottom-3 left-3 max-w-[80%] truncate rounded-full bg-[#0B192C]/80 px-3 py-1 text-[10px] font-semibold tracking-wide text-[#C5A880]">
          {badge}
        </p>
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2" role="tablist" aria-label={`Photos de ${title}`}>
          {photos.map((row, photoIndex) => {
            const selected = photoIndex === index;
            return (
              <button
                key={`${row.url}-${photoIndex}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={row.caption || `Photo ${photoIndex + 1}`}
                onClick={() => setIndex(photoIndex)}
                className={`h-12 w-16 shrink-0 overflow-hidden rounded-md ring-1 ring-offset-1 ring-offset-[#0B192C] ${
                  selected ? "ring-[#C5A880]" : "ring-white/20"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- vignette catalogue Little Emperors */}
                <img src={row.thumb || row.url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Vignette carrée. Le clic ouvre toutes les photos, sans la bande de miniatures. */
export function HotelPhotoThumb({ photos, title }: { photos: HotelPhoto[]; title: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const cover = photos[0];
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  if (!cover) return null;
  const label = photoCountLabel(photos.length);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-card-control=""
        className="relative block w-full overflow-hidden rounded-xl ring-1 ring-[#e5e3dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-gold)]"
        aria-label={`Voir les ${photos.length} photo${photos.length > 1 ? "s" : ""} de ${title}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- photo catalogue, hors next/image */}
        <img
          src={cover.thumb || cover.url}
          alt=""
          className="aspect-square w-full object-cover"
          referrerPolicy="no-referrer"
        />
        <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#0B192C]/80 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white">
          {label}
        </span>
      </button>
      {open ? <HotelLightbox photos={photos} title={title} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function HotelLightbox({
  photos,
  title,
  onClose,
}: {
  photos: HotelPhoto[];
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const indexRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  function go(delta: number) {
    scrollGallery(scroller.current, indexRef.current, delta, photos.length);
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollGallery(scroller.current, indexRef.current, 1, photos.length);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollGallery(scroller.current, indexRef.current, -1, photos.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [photos.length]);

  function onScroll() {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    const next = Math.min(photos.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }

  if (typeof document === "undefined") return null;
  const photo = photos[index] || photos[0];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0B192C] text-white"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">
            {title}
          </p>
          <p className="text-sm font-semibold" aria-live="polite">
            Photo {index + 1} sur {photos.length}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
          aria-label="Fermer"
        >
          <Icon name="close" className="h-6 w-6" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((row, photoIndex) => (
            <div
              key={`${row.url}-${photoIndex}`}
              className="flex h-full min-w-full shrink-0 snap-center items-center justify-center px-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- photo catalogue, hors next/image */}
              <img
                src={row.url}
                alt={row.caption ? `${title}, ${row.caption}` : `${title}, photo ${photoIndex + 1}`}
                className="max-h-full max-w-full object-contain"
                referrerPolicy="no-referrer"
                draggable={false}
              />
            </div>
          ))}
        </div>
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute top-1/2 left-2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
              aria-label="Photo précédente"
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <Icon name="chevron_left" className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute top-1/2 right-2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
              aria-label="Photo suivante"
              disabled={index === photos.length - 1}
              onClick={() => go(1)}
            >
              <Icon name="chevron_right" className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        {photo?.caption ? <p className="text-sm text-[#faf9f6]">{photo.caption}</p> : <p className="text-sm text-white/70">L’hôtel</p>}
      </div>
    </div>,
    document.body
  );
}
