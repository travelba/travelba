"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HotelMapPreview } from "@/components/account/HotelMapPreview";
import { HotelOsmMap } from "@/components/account/HotelOsmMap";
import { publicMapboxStyle, publicMapboxToken } from "@/lib/crm/hotel-map";
import type { ClientHotel } from "@/lib/crm/hotel-search";

const HotelMapboxView = dynamic(
  () => import("@/components/account/HotelMapboxView").then((mod) => mod.HotelMapboxView),
  {
    ssr: false,
    loading: () => <div className="h-field h-80 animate-pulse h-skel" aria-hidden />,
  }
);

export function HotelMap({
  hotels,
  onOpen,
}: {
  hotels: ClientHotel[];
  onOpen?: (hotel: ClientHotel) => void;
}) {
  const placed = hotels.filter((hotel) => hotel.coords);
  const token = publicMapboxToken(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const styleUrl = publicMapboxStyle(process.env.NEXT_PUBLIC_MAPBOX_STYLE);
  const [failed, setFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const useMapbox = Boolean(token) && !failed;
  const selected = onOpen ? placed.find((hotel) => hotel.hotelKey === selectedKey) ?? null : null;

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedKey(null);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-hotel-map-preview]")) return;
      if (target.closest(".hotel-map-pin")) return;
      setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [selected]);

  function choose(hotelKey: string) {
    setSelectedKey((current) => (hotelKey && current !== hotelKey ? hotelKey : null));
  }

  if (!placed.length) return null;

  return (
    <div className="relative" data-hotel-map={useMapbox ? "mapbox" : "osm"}>
      {useMapbox && token ? (
        <div className="h-field relative h-80 overflow-hidden">
          <HotelMapboxView
            key={styleUrl}
            hotels={placed}
            token={token}
            styleUrl={styleUrl}
            selectedKey={selected?.hotelKey ?? null}
            onSelect={onOpen ? choose : undefined}
            onFail={() => setFailed(true)}
          />
        </div>
      ) : (
        <HotelOsmMap hotels={placed} selectedKey={selected?.hotelKey ?? null} onSelect={onOpen ? choose : undefined} />
      )}
      {selected && onOpen ? (
        <HotelMapPreview hotel={selected} onOpen={onOpen} onClose={() => setSelectedKey(null)} />
      ) : null}
    </div>
  );
}
