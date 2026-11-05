"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/crm/icons";
import { hotelMapCaption, hotelPreviewImages } from "@/lib/crm/hotel-map";
import type { ClientHotel } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";

function stayLabel(nights: number) {
  if (nights > 1) return `${nights} nuits`;
  if (nights === 1) return "1 nuit";
  return "Séjour";
}

function Photos({ images, name }: { images: string[]; name: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const shown = images.filter((src) => !failed.includes(src));

  function onScroll() {
    const node = scroller.current;
    if (!node || node.clientWidth < 1) return;
    setAt(Math.max(0, Math.min(shown.length - 1, Math.round(node.scrollLeft / node.clientWidth))));
  }

  return (
    <div className="relative bg-[#0b192c]">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="hotel-map-photos h-gallery flex snap-x snap-mandatory overflow-x-auto"
        aria-label={shown.length > 1 ? `Photos de ${name}` : undefined}
      >
        {shown.length ? (
          shown.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
            <img
              key={`${src}-${index}`}
              src={src}
              alt={index === 0 ? name : ""}
              width={800}
              height={480}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-full w-full shrink-0 snap-start object-cover"
              onError={() => setFailed((current) => (current.includes(src) ? current : [...current, src]))}
            />
          ))
        ) : (
          <div className="grid h-full w-full shrink-0 place-items-center text-[#C5A880]">
            <Icon name="hotel" className="h-8 w-8" />
          </div>
        )}
      </div>
      {shown.length > 1 ? (
        <p className="h-pin absolute bottom-2 right-2">
          {Math.min(at + 1, shown.length)}/{shown.length}
        </p>
      ) : null}
    </div>
  );
}

/** Feuille du bas : photos, nom, étoiles et lieu, prix du séjour, puis la fiche. */
export function HotelMapPreview({
  hotel,
  onOpen,
  onClose,
}: {
  hotel: ClientHotel;
  onOpen: (hotel: ClientHotel) => void;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const images = hotelPreviewImages(hotel);
  const caption = hotelMapCaption(hotel);
  const price = formatMoney(hotel.sellCents / 100, hotel.currency);

  useEffect(() => {
    sheetRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={sheetRef}
      className="hotel-theme hotel-map-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu, ${hotel.name}`}
      tabIndex={-1}
      data-hotel-map-preview="1"
    >
      <div className="flex justify-center pt-2" aria-hidden>
        <span className="h-1 w-8 rounded-full bg-[#e6e0d6]" />
      </div>
      <button
        type="button"
        aria-label="Fermer l’aperçu"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#0b192c] shadow-sm"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      <Photos images={images} name={hotel.name} />
      <div className="px-4 pb-3 pt-3">
        <h3 className="h-serif pr-8 text-[1.15rem] font-semibold leading-tight h-ink">{hotel.name}</h3>
        {caption ? (
          <p className="mt-0.5 text-sm h-muted" data-hotel-map-caption="1">
            {caption}
          </p>
        ) : null}
        <p className="mt-2 text-lg font-medium leading-tight h-ink" data-hotel-map-price="1">
          {price}
          <span className="mt-0.5 block text-sm font-normal h-muted">
            {stayLabel(hotel.nights)}
            {hotel.perNightCents > 0 ? ` · ${formatMoney(hotel.perNightCents / 100, hotel.currency)} / nuit` : ""}
          </span>
        </p>
        <button
          type="button"
          data-hotel-map-fiche="1"
          className="h-btn h-search-go h-press mt-3 flex h-12 w-full items-center justify-center text-sm font-semibold"
          onClick={() => onOpen(hotel)}
        >
          Voir la fiche
        </button>
      </div>
    </div>,
    document.body
  );
}
