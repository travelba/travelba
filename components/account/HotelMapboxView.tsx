"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { hotelMapBounds, hotelPinClass } from "@/lib/crm/hotel-map";
import { fatalMapboxError, rewriteMapboxRequest, sanitizeMapboxLog } from "@/lib/crm/mapbox-proxy";
import type { ClientHotel } from "@/lib/crm/hotel-search";
import { formatMoney } from "@/lib/crm/money";
import "mapbox-gl/dist/mapbox-gl.css";

function placedHotels(hotels: ClientHotel[]) {
  return hotels.filter((hotel): hotel is ClientHotel & { coords: { lat: number; lng: number } } => Boolean(hotel.coords));
}

function frameReady(node: HTMLElement) {
  return node.clientWidth > 2 && node.clientHeight > 2;
}

/**
 * Mapbox GL. Ce module n’est importé que pour la vue Carte, et seulement
 * si le jeton public est présent. Le cadre a une hauteur réelle avant l’init :
 * la classe Mapbox passe le conteneur en `position: relative` et un cadre
 * absolu de hauteur nulle disparaît derrière le fond blanc.
 */
export function HotelMapboxView({
  hotels,
  token,
  styleUrl,
  selectedKey,
  onSelect,
  onFail,
}: {
  hotels: ClientHotel[];
  token: string;
  styleUrl: string;
  selectedKey?: string | null;
  onSelect?: (hotelKey: string) => void;
  onFail?: (reason: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const boundsKeyRef = useRef("");
  const hotelsRef = useRef(hotels);
  const onSelectRef = useRef(onSelect);
  const onFailRef = useRef(onFail);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    hotelsRef.current = hotels;
    onSelectRef.current = onSelect;
    onFailRef.current = onFail;
  }, [hotels, onFail, onSelect]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const markers = markersRef.current;
    let map: mapboxgl.Map | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;

    const fail = (reason: string) => {
      if (cancelled) return;
      cancelled = true;
      console.error("[hotel-map]", sanitizeMapboxLog(reason));
      onFailRef.current?.(reason);
    };

    const start = () => {
      if (cancelled || map || !frameReady(node)) return;
      const first = placedHotels(hotelsRef.current)[0];
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const origin = window.location.origin;
      try {
        map = new mapboxgl.Map({
          container: node,
          style: styleUrl,
          accessToken: token,
          language: "fr",
          center: first ? [first.coords.lng, first.coords.lat] : [-0.58, 44.84],
          zoom: first ? 12 : 2,
          attributionControl: true,
          logoPosition: "bottom-left",
          cooperativeGestures: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxPitch: 0,
          pitch: 0,
          fadeDuration: reduce ? 0 : 200,
          respectPrefersReducedMotion: true,
          performanceMetricsCollection: false,
          collectResourceTiming: false,
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
          projection: "mercator",
          transformRequest: (url) => {
            const proxied = rewriteMapboxRequest(url, origin);
            return { url: proxied || url, referrerPolicy: "origin" };
          },
        });
      } catch (error) {
        fail(fatalMapboxError(error) || "webgl");
        return;
      }
      const created = map;
      mapRef.current = created;
      const onError = (event: mapboxgl.ErrorEvent) => {
        const reason = fatalMapboxError(event.error);
        if (reason) fail(reason);
      };
      const onMapClick = (event: mapboxgl.MapMouseEvent) => {
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest(".hotel-map-pin")) return;
        onSelectRef.current?.("");
      };
      created.on("error", onError);
      created.on("click", onMapClick);
      created.getCanvas().addEventListener("webglcontextlost", () => fail("webgl"));
      created.on("load", () => {
        if (!cancelled) created.resize();
      });
      setGeneration((value) => value + 1);
    };

    observer = new ResizeObserver(() => {
      if (!mapRef.current) start();
      else mapRef.current.resize();
    });
    observer.observe(node);
    start();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!mapRef.current) start();
      else mapRef.current.resize();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      boundsKeyRef.current = "";
      markers.forEach((marker) => marker.remove());
      markers.clear();
      mapRef.current = null;
      map?.remove();
    };
  }, [styleUrl, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const rows = placedHotels(hotels);
    const live = new Set<string>();
    const choose = onSelect;
    for (const hotel of rows) {
      live.add(hotel.hotelKey);
      const price = formatMoney(hotel.sellCents / 100, hotel.currency);
      const selected = hotel.hotelKey === selectedKey;
      let marker = markers.get(hotel.hotelKey);
      if (!marker) {
        const element = document.createElement(choose ? "button" : "span");
        element.className = hotelPinClass(false);
        if (element instanceof HTMLButtonElement) {
          element.type = "button";
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const key = element.dataset.hotelKey;
            if (key) onSelectRef.current?.(key);
          });
        }
        marker = new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([hotel.coords.lng, hotel.coords.lat]).addTo(map);
        markers.set(hotel.hotelKey, marker);
      }
      const element = marker.getElement();
      element.dataset.hotelKey = hotel.hotelKey;
      element.textContent = price;
      element.setAttribute("aria-label", `${hotel.name}, ${price}`);
      if (element instanceof HTMLButtonElement) element.setAttribute("aria-pressed", selected ? "true" : "false");
      element.classList.toggle("h-pin-on", selected);
      marker.setLngLat([hotel.coords.lng, hotel.coords.lat]);
    }
    for (const [key, marker] of markers) {
      if (live.has(key)) continue;
      marker.remove();
      markers.delete(key);
    }
    const boundsKey = rows
      .map((hotel) => `${hotel.hotelKey}:${hotel.coords.lng.toFixed(5)}:${hotel.coords.lat.toFixed(5)}`)
      .sort()
      .join("|");
    if (!boundsKey || boundsKey === boundsKeyRef.current) return;
    const fit = () => {
      if (!mapRef.current || boundsKeyRef.current === boundsKey) return;
      boundsKeyRef.current = boundsKey;
      const bounds = hotelMapBounds(rows.map((hotel) => hotel.coords));
      if (!bounds) return;
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
      const same = bounds.sw[0] === bounds.ne[0] && bounds.sw[1] === bounds.ne[1];
      if (same) mapRef.current.easeTo({ center: bounds.sw, zoom: 14, duration });
      else mapRef.current.fitBounds([bounds.sw, bounds.ne], { padding: { top: 56, bottom: 36, left: 40, right: 40 }, maxZoom: 14.5, duration });
    };
    if (map.loaded()) fit();
    else map.once("load", fit);
  }, [generation, hotels, onSelect, selectedKey]);

  return (
    <div
      ref={frameRef}
      data-hotel-map-frame="1"
      className="hotel-map-frame"
      style={{ position: "relative", width: "100%", height: "100%", minHeight: "20rem" }}
    />
  );
}
