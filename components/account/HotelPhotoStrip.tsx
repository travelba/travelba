"use client";

import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Icon } from "@/components/crm/icons";
import { hotelImageLoader, hotelPhotoList } from "@/lib/crm/hotel-photos";

const SIZES = "(max-width: 768px) 100vw, 480px";

function smooth() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Bande de photos. Le doigt fait défiler en natif. Un balayage n’ouvre pas la fiche. */
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
  const indexRef = useRef(0);
  const origin = useRef(0);
  const suppress = useRef(false);
  const preloaded = useRef(new Set<string>());
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const counter = useRef<HTMLParagraphElement>(null);
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const count = photos.length;

  function preload(from: number) {
    for (const src of [photos[from], photos[from + 1], photos[from + 2]]) {
      if (!src || preloaded.current.has(src)) continue;
      preloaded.current.add(src);
      const image = new window.Image();
      image.decoding = "async";
      image.src = hotelImageLoader({ src, width: 828 });
    }
  }

  function paint(index: number) {
    dots.current.forEach((dot, dotIndex) => {
      if (!dot) return;
      const on = dotIndex === index;
      dot.classList.toggle("bg-[#C5A880]", on);
      dot.classList.toggle("bg-white/75", !on);
      dot.setAttribute("aria-current", on ? "true" : "false");
    });
    if (counter.current) counter.current.textContent = `${index + 1}/${count}`;
  }

  function readIndex() {
    const node = scroller.current;
    if (!node || node.clientWidth < 1 || !count) return 0;
    return Math.max(0, Math.min(count - 1, Math.round(node.scrollLeft / node.clientWidth)));
  }

  function commit(index: number) {
    if (index === indexRef.current && index === at) {
      paint(index);
      return;
    }
    indexRef.current = index;
    paint(index);
    preload(index);
    setAt((current) => (current === index ? current : index));
  }

  function onScroll() {
    const index = readIndex();
    if (index === indexRef.current) return;
    commit(index);
  }

  function go(next: number) {
    const node = scroller.current;
    if (!node || !count) return;
    const indexNext = Math.max(0, Math.min(count - 1, next));
    node.scrollTo({ left: indexNext * node.clientWidth, behavior: smooth() ? "smooth" : "auto" });
  }

  useEffect(() => {
    preload(0);
    // Le préchargement ne dépend que de la liste, lue au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.join("|")]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    origin.current = scroller.current?.scrollLeft ?? 0;
  }

  function onClick(event: ReactMouseEvent) {
    const moved = Math.abs((scroller.current?.scrollLeft ?? 0) - origin.current) > 4;
    if (suppress.current || moved) {
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
    suppress.current = true;
    go(indexRef.current + delta);
  }

  function onKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    go(indexRef.current + (event.key === "ArrowRight" ? 1 : -1));
  }

  return (
    <div className="h-photo-frame absolute inset-0" data-hotel-strip="1">
      <div
        ref={scroller}
        className="h-strip"
        tabIndex={count > 1 ? 0 : undefined}
        aria-label={count > 1 ? "Photos, glisser pour défiler" : undefined}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKey}
      >
        {count ? (
          photos.map((src, imageIndex) => (
            <div key={`${src}-${imageIndex}`} className="h-strip-slide">
              <Photo
                src={src}
                alt={imageIndex === 0 ? alt : ""}
                eager={Boolean(eager && imageIndex === 0) || imageIndex === at || imageIndex === at + 1 || imageIndex === at + 2}
              />
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
            <Icon name="chevron_left" className="h-5 w-5" />
          </button>
          <button type="button" className="h-strip-arrow right-2" aria-label="Photo suivante" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => nudge(event, 1)}>
            <Icon name="chevron_right" className="h-5 w-5" />
          </button>
          <div className="absolute left-0 right-0 top-3 z-[4] flex justify-center gap-1">
            {photos.map((src, imageIndex) => (
              <button
                key={`${src}-dot-${imageIndex}`}
                ref={(node) => {
                  dots.current[imageIndex] = node;
                }}
                type="button"
                aria-label={`Photo ${imageIndex + 1}`}
                aria-current={imageIndex === at ? "true" : "false"}
                className={`h-2 w-2 rounded-full ${imageIndex === at ? "bg-[#C5A880]" : "bg-white/75"}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  suppress.current = true;
                  go(imageIndex);
                }}
              />
            ))}
          </div>
          <p ref={counter} className="h-pin pointer-events-none absolute right-3 top-3">{at + 1}/{count}</p>
        </>
      ) : null}
      {open && photos[at] ? <Lightbox photos={photos} alt={alt} index={at} onShift={(delta) => go(at + delta)} onClose={() => setOpen(false)} /> : null}
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

const Photo = memo(function Photo({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
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
    <div className={`h-skel relative h-full w-full ${ready ? "" : "animate-pulse"}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={SIZES}
        loader={hotelImageLoader}
        className={`object-cover ${ready ? "h-fade" : "opacity-0"}`}
        loading={eager ? "eager" : "lazy"}
        priority={Boolean(eager)}
        fetchPriority={eager ? "high" : "auto"}
        referrerPolicy="no-referrer"
        onLoad={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
});
