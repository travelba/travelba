"use client";

import { useEffect, useRef, useState } from "react";
import { coverDisplayUrl, coverSrcSet } from "@/lib/crm/covers";

function generatedCoverId(src: string) {
  const match = src.match(/\/api\/covers\/(photo-city-[A-Za-z0-9_-]+)/);
  return match?.[1] || null;
}

export function CoverPhoto({
  src,
  fallbackSrc = null,
  alt,
  className = "absolute inset-0 h-full w-full object-cover",
  priority = false,
  width = 960,
  sizes = "(max-width: 768px) 100vw, 960px",
}: {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
  /** Largeur demandée au catalogue (`?w=`). Les fichiers importés l’ignorent. */
  width?: number;
  sizes?: string;
}) {
  const generatedId = generatedCoverId(src);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"show" | "wait" | "fallback">("show");
  const [seenSrc, setSeenSrc] = useState(src);
  const retries = useRef(0);
  if (src !== seenSrc) {
    setSeenSrc(src);
    setPhase("show");
    setAttempt(0);
  }

  useEffect(() => {
    retries.current = 0;
  }, [src]);

  useEffect(() => {
    if (phase !== "wait" || !generatedId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const max = priority ? 24 : 4;
    const delay = priority ? 4000 : 8000;
    const poll = async () => {
      try {
        const res = await fetch(`/api/covers/${generatedId}?meta=1`, { cache: "no-store" });
        const data = (await res.json()) as { state?: string };
        if (stopped) return;
        if (data.state === "ready") {
          setAttempt((value) => value + 1);
          setPhase("show");
          return;
        }
        if (data.state === "failed") {
          setPhase(fallbackSrc ? "fallback" : "wait");
          return;
        }
      } catch {
        /* le prochain essai reprend */
      }
      if (stopped) return;
      tries += 1;
      if (tries >= max) return;
      timer = setTimeout(() => void poll(), delay);
    };
    timer = setTimeout(() => void poll(), priority ? 1200 : 2500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase, generatedId, priority, fallbackSrc]);

  if (phase === "wait") return null;

  const base = phase === "fallback" && fallbackSrc ? fallbackSrc : src;
  const display = coverDisplayUrl(base, width);
  const shown =
    attempt > 0 && phase === "show" && generatedId
      ? `${display}${display.includes("?") ? "&" : "?"}try=${attempt}`
      : display;
  const srcSet = attempt > 0 ? undefined : coverSrcSet(base);
  const fallback = fallbackSrc ? coverDisplayUrl(fallbackSrc, width) : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photo de couverture, dimensions déjà choisies
    <img
      key={shown}
      src={shown}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      referrerPolicy="no-referrer"
      onError={(event) => {
        const img = event.currentTarget;
        if (generatedId && phase === "show") {
          if (retries.current >= 2) {
            setPhase(fallbackSrc ? "fallback" : "wait");
            return;
          }
          retries.current += 1;
          setPhase("wait");
          return;
        }
        if (img.dataset.fallback === "1" || phase === "fallback") {
          img.style.display = "none";
          return;
        }
        if (fallback && img.currentSrc !== fallback && img.src !== fallback) {
          img.dataset.fallback = "1";
          img.srcset = "";
          img.src = fallback;
          return;
        }
        img.style.display = "none";
      }}
    />
  );
}
