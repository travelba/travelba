"use client";

import { useState, type ReactNode } from "react";
import { HotelPhotoThumb } from "@/components/crm/HotelGallery";
import { HotelContactButton } from "@/components/crm/HotelContact";
import type { HotelPhoto } from "@/lib/crm/hotel-gallery";
import type { CrmBookingItem } from "@/lib/crm/types";

/**
 * Carte hôtel client : photo carrée à gauche, nom, chambre, prix et lien à droite.
 * Le texte ouvre le détail. La photo ouvre la galerie.
 */
export function HotelReservationCard({
  photos,
  title,
  kicker,
  room,
  price,
  item,
  children,
}: {
  photos: HotelPhoto[];
  title: string;
  kicker: string;
  room: string;
  price: string | null;
  item: CrmBookingItem;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white">
      <div className="grid grid-cols-[40%_minmax(0,1fr)] items-start gap-3 px-3.5 py-3">
        <HotelPhotoThumb photos={photos} title={title} />
        <div className="min-w-0">
          <button
            type="button"
            className="w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-gold)]"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{kicker}</p>
            <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">{title}</p>
            {room ? <p className="mt-0.5 line-clamp-2 break-words text-xs leading-snug text-muted">{room}</p> : null}
            {price ? <p className="mt-1.5 text-sm font-bold text-[var(--admin-navy)]">{price}</p> : null}
          </button>
          <HotelContactButton item={item} roster={false} trailingArrow />
        </div>
      </div>
      {open ? children : null}
    </div>
  );
}
