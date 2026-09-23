"use client";

export function CoverPhoto({
  src,
  fallbackSrc = null,
  alt,
  className = "absolute inset-0 h-full w-full object-cover",
  priority = false,
}: {
  src: string;
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
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
        if (fallbackSrc && img.src !== fallbackSrc) {
          img.dataset.fallback = "1";
          img.src = fallbackSrc;
          return;
        }
        img.style.display = "none";
      }}
    />
  );
}
