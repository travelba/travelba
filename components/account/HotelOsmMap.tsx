"use client";

import { formatMoney } from "@/lib/crm/money";
import { hotelPinClass } from "@/lib/crm/hotel-map";
import type { ClientHotel } from "@/lib/crm/hotel-search";

function project(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

function zoomFor(points: { lat: number; lng: number }[]) {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
  if (span < 0.04) return 13;
  if (span < 0.15) return 12;
  if (span < 0.6) return 10;
  return 7;
}

/** Tuiles actuelles. Repli quand Mapbox n’est pas configuré, ou si la carte WebGL échoue. */
export function HotelOsmMap({
  hotels,
  selectedKey,
  onSelect,
}: {
  hotels: ClientHotel[];
  selectedKey?: string | null;
  onSelect?: (hotelKey: string) => void;
}) {
  const placed = hotels.filter((hotel) => hotel.coords);
  if (!placed.length) return null;
  const zoom = zoomFor(placed.map((hotel) => hotel.coords!));
  const center = placed.reduce(
    (sum, hotel) => ({ lat: sum.lat + hotel.coords!.lat / placed.length, lng: sum.lng + hotel.coords!.lng / placed.length }),
    { lat: 0, lng: 0 }
  );
  const origin = project(center.lat, center.lng, zoom);
  const x0 = Math.floor(origin.x) - 1;
  const y0 = Math.floor(origin.y) - 1;
  const tiles = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ x: x0 + col, y: y0 + row, col, row })));
  return (
    <div className="h-field relative h-80 overflow-hidden">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element -- tuile de carte, hors next/image
          <img
            key={`${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            width={256}
            height={256}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ))}
      </div>
      {placed.map((hotel) => {
        const point = project(hotel.coords!.lat, hotel.coords!.lng, zoom);
        const left = ((point.x - x0) / 3) * 100;
        const top = ((point.y - y0) / 3) * 100;
        if (left < -5 || left > 105 || top < -5 || top > 105) return null;
        const price = formatMoney(hotel.sellCents / 100, hotel.currency);
        const style = { left: `${left.toFixed(2)}%`, top: `${top.toFixed(2)}%` };
        if (!onSelect) {
          return (
            <span key={hotel.hotelKey} className="h-pin absolute -translate-x-1/2 -translate-y-full" style={style}>
              {price}
            </span>
          );
        }
        const selected = hotel.hotelKey === selectedKey;
        return (
          <button
            key={hotel.hotelKey}
            type="button"
            data-hotel-key={hotel.hotelKey}
            aria-label={`${hotel.name}, ${price}`}
            aria-pressed={selected}
            onClick={() => onSelect(hotel.hotelKey)}
            className={`${hotelPinClass(selected)} absolute -translate-x-1/2 -translate-y-full`}
            style={style}
          >
            {price}
          </button>
        );
      })}
    </div>
  );
}
