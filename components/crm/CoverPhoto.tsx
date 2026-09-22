"use client";

const FALLBACK =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=960&h=720&q=70";

export function CoverPhoto({
  src,
  alt,
  className = "absolute inset-0 h-full w-full object-cover",
  priority = false,
}: {
  src: string;
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
        if (img.dataset.fallback === "1" || img.src === FALLBACK) return;
        img.dataset.fallback = "1";
        img.src = FALLBACK;
      }}
    />
  );
}
