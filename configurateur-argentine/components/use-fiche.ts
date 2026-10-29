"use client";

import { useEffect, useState } from "react";
import type { FicheMedia } from "@/lib/fiche";

const cache = new Map<string, FicheMedia>();

export function useFiche(url: string | null): FicheMedia | null {
  const [media, setMedia] = useState<FicheMedia | null>(url ? (cache.get(url) ?? null) : null);

  useEffect(() => {
    if (!url) return;
    const hit = cache.get(url);
    if (hit) {
      setMedia(hit);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/fiche?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("fiche");
        return (await response.json()) as FicheMedia;
      })
      .then((next) => {
        cache.set(url, next);
        if (!controller.signal.aborted) setMedia(next);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setMedia({
            url,
            title: null,
            description: null,
            images: [],
            sourceHost: "",
            fetchedAt: new Date().toISOString(),
            ok: false,
            error: "reseau",
          });
        }
      });
    return () => controller.abort();
  }, [url]);

  return media;
}
