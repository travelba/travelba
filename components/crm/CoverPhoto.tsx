"use client";

import { coverDisplayUrl, coverSrcSet } from "@/lib/crm/covers";

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
  const display = coverDisplayUrl(src, width);
  const srcSet = coverSrcSet(src);
  const fallback = fallbackSrc ? coverDisplayUrl(fallbackSrc, width) : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={display}
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
        if (img.dataset.fallback === "1") {
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
