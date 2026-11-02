import { siteConfig } from "@/lib/site";

export function AgencyLogo({
  className = "h-9 w-9",
  alt = siteConfig.name,
}: {
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- marque locale, pas next/image
    <img
      src="/brand/logo-tba-256.png"
      alt={alt}
      width={36}
      height={36}
      className={`shrink-0 ${className}`}
    />
  );
}
