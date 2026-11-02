export function Photo({
  id,
  alt,
  className,
  priority = false,
}: {
  id: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- photos éditoriales Unsplash, hors next/image
    <img
      src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=2000&q=75`}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
