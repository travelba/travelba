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
    />
  );
}
