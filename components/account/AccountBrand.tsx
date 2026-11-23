import Link from "next/link";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";

/** Marque de l’espace client, sans le jeu d’icônes de l’agence. */
export function AccountBrand({
  href = "/",
  subtitle,
  compact = false,
}: {
  href?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <AgencyLogo className="h-9 w-9" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Travel Business Agency
        </span>
        {subtitle ? (
          <span
            className={`account-title truncate font-display font-semibold leading-none text-[var(--admin-navy)] ${
              compact ? "text-[15px]" : "text-lg"
            }`}
          >
            {subtitle}
          </span>
        ) : (
          <span className="account-title font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">
            {siteConfig.shortName}
          </span>
        )}
      </span>
    </Link>
  );
}
