"use client";

import { useEffect, useRef } from "react";
import { shouldPlayHeroVideo } from "@/lib/site-hero";

/**
 * Les sources sont dans le HTML (autoplay, muet, playsInline) : la lecture ne dépend pas
 * de l’hydratation, et le fichier reste léger (une seule variante, ~150–320 Ko).
 * Mouvement réduit ou économie de données : on retire la source, le poster reste.
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (
      !shouldPlayHeroVideo({
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        saveData: Boolean(nav.connection?.saveData),
      })
    ) {
      video.pause();
      for (const source of video.querySelectorAll("source")) source.remove();
      video.removeAttribute("src");
      video.load();
      return;
    }

    const play = () => {
      video.play().catch(() => {});
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
    else video.addEventListener("canplay", play, { once: true });
    return () => video.removeEventListener("canplay", play);
  }, []);

  return (
    <video
      ref={videoRef}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
    >
      <source media="(min-width: 768px)" src="/videos/hero-desktop.webm" type='video/webm; codecs="vp9"' />
      <source media="(min-width: 768px)" src="/videos/hero-desktop.mp4" type="video/mp4" />
      <source src="/videos/hero-mobile.webm" type='video/webm; codecs="vp9"' />
      <source src="/videos/hero-mobile.mp4" type="video/mp4" />
    </video>
  );
}
