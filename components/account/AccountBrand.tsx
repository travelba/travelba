import Link from "next/link";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";

/** Marque de l’espace client, sans le jeu d’icônes de l’agence. */
export function AccountBrand({
  href = "/",
  subtitle,
  mark = "Travel Business Agency",
  compact = false,
  onDark = false,
}: {
  href?: string;
  subtitle?: string;
  mark?: string;
  compact?: boolean;
  onDark?: boolean;
}) {
  const ink = onDark ? "text-[#f7f4ee]" : "text-[var(--admin-navy)]";
  const lead = onDark ? "leading-snug" : "leading-none";
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <AgencyLogo className="h-9 w-9" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          {mark}
        </span>
        {subtitle ? (
          <span
            className={`account-title truncate font-display font-semibold ${lead} ${ink} ${
              compact ? "text-[15px]" : "text-lg"
            }`}
          >
            {subtitle}
          </span>
        ) : (
          <span className={`account-title font-display text-lg font-extrabold tracking-tight ${ink}`}>
            {siteConfig.shortName}
          </span>
        )}
      </span>
    </Link>
  );
}
