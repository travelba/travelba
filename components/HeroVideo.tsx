"use client";

import { useEffect, useRef, useState } from "react";
import { pickHeroVideo, shouldPlayHeroVideo } from "@/lib/site-hero";

/** La source n’est posée qu’après le premier affichage, pour ne pas concurrencer les liens. */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (
      !shouldPlayHeroVideo({
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        saveData: Boolean(nav.connection?.saveData),
      })
    ) {
      return;
    }

    let cancelled = false;
    const arm = () => {
      if (cancelled) return;
      const probe = document.createElement("video");
      const webm = probe.canPlayType('video/webm; codecs="vp9"') !== "";
      setSrc(pickHeroVideo({ wide: window.matchMedia("(min-width: 768px)").matches, webm }));
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(arm, { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = window.setTimeout(arm, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!src || !video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const play = () => {
      video.play().catch(() => {});
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
    else video.addEventListener("canplay", play, { once: true });
    return () => video.removeEventListener("canplay", play);
  }, [src]);

  return (
    <video
      ref={videoRef}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      muted
      loop
      playsInline
      preload="none"
      autoPlay={Boolean(src)}
      aria-hidden="true"
      src={src ?? undefined}
    />
  );
}
