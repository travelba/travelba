"use client";

import { useState } from "react";
import type { HotelPhoto } from "@/lib/crm/hotel-gallery";

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
