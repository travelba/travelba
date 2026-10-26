import Image from "next/image";
import { unsplash } from "./photos";

export function Photo({
  id,
  alt,
  sizes,
  preload = false,
  width = 2000,
  className,
}: {
  id: string;
  alt: string;
  sizes: string;
  preload?: boolean;
  width?: number;
  className?: string;
}) {
  return (
    <Image
      src={unsplash(id, width)}
      alt={alt}
      fill
      sizes={sizes}
      preload={preload || undefined}
      className={className ? `object-cover ${className}` : "object-cover"}
    />
  );
}
