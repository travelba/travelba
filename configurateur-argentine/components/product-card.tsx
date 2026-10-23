"use client";

import { useState } from "react";
import { useFiche } from "@/components/use-fiche";

type CardProps = {
  name: string;
  priceLabel: string;
  meta: string;
  url: string;
  selected: boolean;
  onSelect: () => void;
};

export function ProductCard({ name, priceLabel, meta, url, selected, onSelect }: CardProps) {
  const media = useFiche(url);
  const [broken, setBroken] = useState(false);
  const image = media?.images[0];

  return (
    <button type="button" className="kiosk-card" aria-pressed={selected} onClick={onSelect}>
      <span className="kiosk-card-photo">
        {image && !broken ? (
          // Photo officielle servie par le cache local.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/fiche/image?id=${image.id}`} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : (
          <span className="kiosk-card-fallback">{name}</span>
        )}
        {selected ? <span className="kiosk-chosen">Choisi</span> : null}
      </span>
      <span className="kiosk-card-body">
        <span className="kiosk-card-name">{name}</span>
        <span className="kiosk-card-meta">{meta}</span>
        <span className="kiosk-card-price">{priceLabel}</span>
      </span>
    </button>
  );
}

type TileProps = {
  label: string;
  detail: string;
  selected: boolean;
  onSelect: () => void;
};

export function ChoiceTile({ label, detail, selected, onSelect }: TileProps) {
  return (
    <button type="button" className="kiosk-tile" aria-pressed={selected} onClick={onSelect}>
      {selected ? <span className="kiosk-chosen">Choisi</span> : null}
      <span className="kiosk-card-name">{label}</span>
      <span className="kiosk-card-price">{detail}</span>
    </button>
  );
}
