"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import { hotelPhotoList, photoGesture } from "@/lib/crm/hotel-photos";

type Drag = { id: number; x: number; y: number; left: number; mode: "pending" | "swipe" | "scroll" };

function smooth() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Bande de photos. Un balayage ou une flèche ne compte pas comme un appui. */
export function HotelPhotoStrip({
  photo,
  images,
  alt,
  eager,
  fullscreen,
  onActivate,
}: {
  photo?: string | null;
  images?: readonly (string | null | undefined)[] | null;
  alt: string;
  eager?: boolean;
  /** Un appui net ouvre la photo en grand. Les flèches et le balayage ne le font pas. */
  fullscreen?: boolean;
  onActivate?: () => void;
}) {
  const photos = hotelPhotoList({ photo, images });
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppress = useRef(false);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const count = photos.length;
  const index = count ? Math.min(at, count - 1) : 0;

  function readIndex() {
    const node = scroller.current;
    if (!node || node.clientWidth < 1 || !count) return 0;
    return Math.max(0, Math.min(count - 1, Math.round(node.scrollLeft / node.clientWidth)));
  }

  function go(next: number) {
    const node = scroller.current;
    if (!node || !count) return;
    const indexNext = Math.max(0, Math.min(count - 1, next));
    setAt(indexNext);
    node.style.scrollSnapType = "";
    node.scrollTo({ left: indexNext * node.clientWidth, behavior: smooth() ? "smooth" : "auto" });
  }

  function onScroll() {
    if (drag.current?.mode === "swipe") return;
    setAt(readIndex());
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const node = scroller.current;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: node?.scrollLeft ?? 0,
      mode: "pending",
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.mode === "pending") {
      const gesture = photoGesture(dx, dy);
      if (gesture === "pending") return;
      current.mode = gesture;
      if (gesture === "scroll") {
        drag.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      if (scroller.current) scroller.current.style.scrollSnapType = "none";
    }
    if (current.mode !== "swipe") return;
    event.preventDefault();
    event.stopPropagation();
    if (scroller.current) scroller.current.scrollLeft = current.left - dx;
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (current.mode === "swipe") {
      suppress.current = true;
      event.preventDefault();
      event.stopPropagation();
      go(readIndex());
    }
  }

  function onClick(event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent) {
    if (suppress.current) {
      suppress.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (fullscreen) setOpen(true);
    else onActivate?.();
  }

  function nudge(event: ReactMouseEvent, delta: number) {
    event.preventDefault();
    event.stopPropagation();
    go(index + delta);
  }

  return (
    <div className="h-photo-frame absolute inset-0" data-hotel-strip="1">
      <div
        ref={scroller}
        className="h-strip"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClick={onClick}
      >
        {count ? (
          photos.map((src, imageIndex) => (
            <div key={`${src}-${imageIndex}`} className="h-strip-slide">
              <Photo src={src} alt={imageIndex === 0 ? alt : ""} eager={Boolean(eager) && imageIndex === 0} />
            </div>
          ))
        ) : (
          <div className="h-strip-slide grid place-items-center bg-[#0B192C] text-[#C5A880]">
            <Icon name="hotel" className="h-8 w-8" />
          </div>
        )}
      </div>
      {count > 1 ? (
        <>
          <button type="button" className="h-strip-arrow left-2" aria-label="Photo précédente" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => nudge(event, -1)}>
            <Icon name="chevron_left" className="h-4 w-4" />
          </button>
          <button type="button" className="h-strip-arrow right-2" aria-label="Photo suivante" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => nudge(event, 1)}>
            <Icon name="chevron_right" className="h-4 w-4" />
          </button>
          <div className="absolute left-0 right-0 top-3 z-[4] flex justify-center gap-1">
            {photos.map((src, imageIndex) => (
              <button
                key={`${src}-dot-${imageIndex}`}
                type="button"
                aria-label={`Photo ${imageIndex + 1}`}
                className={`h-2 w-2 rounded-full ${imageIndex === index ? "bg-[#C5A880]" : "bg-white/75"}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  go(imageIndex);
                }}
              />
            ))}
          </div>
          <p className="h-pin pointer-events-none absolute right-3 top-3">{index + 1}/{count}</p>
        </>
      ) : null}
      {open && photos[index] ? <Lightbox photos={photos} alt={alt} index={index} onShift={(delta) => go(index + delta)} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function Lightbox({
  photos,
  alt,
  index,
  onShift,
  onClose,
}: {
  photos: string[];
  alt: string;
  index: number;
  onShift: (delta: number) => void;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const onShiftRef = useRef(onShift);
  useEffect(() => {
    onCloseRef.current = onClose;
    onShiftRef.current = onShift;
  }, [onClose, onShift]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowRight") onShiftRef.current(1);
      if (event.key === "ArrowLeft") onShiftRef.current(-1);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="hotel-theme fixed inset-0 z-[80] flex flex-col bg-[#0B192C] text-[#f7f4ee]" role="dialog" aria-modal="true" aria-label="Galerie">
      <header className="flex items-center justify-between px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="px-2 text-sm">{index + 1} / {photos.length}</p>
        <button type="button" aria-label="Fermer la galerie" onClick={onClose} className="grid h-11 w-11 place-items-center">
          <Icon name="close" className="h-5 w-5 text-[#C5A880]" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <Photo src={photos[index]} alt={alt} eager />
      </div>
    </div>,
    document.body
  );
}

function Photo({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#0B192C] text-[#C5A880]">
        <Icon name="hotel" className="h-8 w-8" />
      </div>
    );
  }
  return (
    <div className={`h-skel h-full w-full ${ready ? "" : "animate-pulse"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image */}
      <img
        src={src}
        alt={alt}
        width={960}
        height={600}
        className={`h-full w-full object-cover ${ready ? "h-fade" : "opacity-0"}`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
