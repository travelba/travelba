import Link from "next/link";
import { AgencyLogo } from "@/components/AgencyLogo";
import { siteConfig } from "@/lib/site";
import { Icon } from "@/components/crm/icons";

export function BrandMark({
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
            className={`truncate font-display font-semibold leading-none text-[var(--admin-navy)] ${
              compact ? "text-[15px]" : "text-lg"
            }`}
          >
            {subtitle}
          </span>
        ) : (
          <span className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">
            {siteConfig.shortName}
          </span>
        )}
      </span>
    </Link>
  );
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--admin-gold)]" />
      {children}
    </p>
  );
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)] sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusChip({
  tone = "sky",
  children,
}: {
  tone?: "sky" | "green" | "amber" | "red" | "navy" | "gold";
  children: React.ReactNode;
}) {
  const tones = {
    sky: "bg-[var(--admin-sky)] text-[var(--admin-navy)] border-transparent",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-[var(--admin-red)] border-red-200",
    navy: "bg-[var(--admin-navy)] text-white border-transparent",
    gold: "bg-[rgba(197,168,128,0.15)] text-[#7a6344] border-[rgba(197,168,128,0.4)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function PhoneWallBanner({ href }: { href?: string }) {
  return (
    <div className="rounded-2xl bg-[var(--admin-gold)]/25 p-5 text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]">
      <p className="font-display text-lg font-bold">Ajoutez un téléphone.</p>
      <p className="mt-2 text-sm">L’agence en a besoin pour vous écrire.</p>
      {href ? (
        <a
          href={href}
          className="mt-4 inline-flex h-11 items-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white"
        >
          Ouvrir ma fiche
        </a>
      ) : null}
    </div>
  );
}

export function ConciergeBanner({
  href,
  label = "WhatsApp",
}: {
  href?: string;
  label?: string;
}) {
  const wa = href || `https://wa.me/${siteConfig.whatsappNumber}`;
  return (
    <aside className="flex flex-col gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
          L’agence
        </span>
      </div>
      <div className="flex items-center gap-3">
        <AgencyLogo className="h-14 w-14" />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-[var(--admin-navy)]">
            Travel Business Agency
          </p>
          <p className="text-sm text-muted">Une question sur le dossier ?</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`tel:+${siteConfig.whatsappNumber}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#e5e3dc] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
        >
          <Icon name="call" className="h-[18px] w-[18px] text-[var(--admin-gold-dark)]" />
          Appel direct
        </a>
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-navy)] text-xs font-semibold uppercase tracking-[0.06em] text-white"
        >
          <Icon name="chat" className="h-[18px] w-[18px] text-[var(--admin-gold)]" />
          {label}
        </a>
      </div>
    </aside>
  );
}

export function BookingStatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-gold)]/50 bg-[var(--admin-navy)]/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--admin-gold)] shadow-sm backdrop-blur-md">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--admin-gold)]" />
      {label}
    </span>
  );
}

export function bookingStatusTone(
  status: string
): "sky" | "green" | "amber" | "red" | "navy" | "gold" {
  switch (status) {
    case "confirmed":
      return "gold";
    case "quoted":
    case "draft":
      return "amber";
    case "cancelled":
      return "red";
    default:
      return "sky";
  }
}

export type CrmSkeletonKind = "list" | "table" | "detail" | "kpis";

const skeletonBlock = "rounded-2xl bg-white ring-1 ring-[#e5e3dc]";

/**
 * Squelette de chargement à la forme de la page (D-19) :
 * `list` = titre + filtre + lignes ; `table` = titre + en-tête + lignes ; `detail` = hero + onglets + cartes ;
 * `kpis` = titre + bandeau + cartes KPI + liste. Sans `kind`, l’ancien squelette (titre + N cartes).
 */
export function CrmSkeleton({ rows = 3, kind }: { rows?: number; kind?: CrmSkeletonKind }) {
  const title = <div className="h-7 w-44 rounded-lg bg-[var(--admin-peach)]" />;
  if (kind === "list") {
    return (
      <div className="animate-pulse space-y-3" aria-hidden>
        {title}
        <div className="h-4 w-72 max-w-full rounded bg-[#ece9e2]" />
        <div className="flex gap-2">
          <div className="h-11 flex-1 rounded-lg bg-[#ece9e2]" />
          <div className="hidden h-11 w-40 rounded-lg bg-[#ece9e2] sm:block" />
        </div>
        <div className={`${skeletonBlock} divide-y divide-[#e5e3dc] overflow-hidden`}>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-5 py-4">
              <div className="h-14 w-24 shrink-0 rounded-xl bg-[#ece9e2]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[#ece9e2]" />
                <div className="h-3 w-1/3 rounded bg-[#f1efea]" />
              </div>
              <div className="h-5 w-20 rounded-full bg-[var(--admin-peach)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "table") {
    return (
      <div className="animate-pulse space-y-3" aria-hidden>
        {title}
        <div className="h-11 w-full rounded-lg bg-[#ece9e2]" />
        <div className={`${skeletonBlock} overflow-hidden`}>
          <div className="h-10 bg-[var(--admin-sky)]/70" />
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 border-t border-[#e5e3dc] px-5 py-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-[#ece9e2]" />
              <div className="h-4 w-1/4 rounded bg-[#ece9e2]" />
              <div className="hidden h-4 w-1/4 rounded bg-[#f1efea] sm:block" />
              <div className="ml-auto h-4 w-16 rounded bg-[#ece9e2]" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "detail") {
    return (
      <div className="animate-pulse space-y-4" aria-hidden>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-8 w-64 max-w-full rounded-lg bg-[var(--admin-peach)]" />
            <div className="h-4 w-40 rounded bg-[#ece9e2]" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-full bg-[#ece9e2]" />
            <div className="h-10 w-10 rounded-full bg-[#ece9e2]" />
          </div>
        </div>
        <div className="flex gap-6 border-b border-[#e5e3dc] pb-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-4 w-20 rounded bg-[#ece9e2]" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={`${skeletonBlock} h-28 rounded-3xl`} />
        ))}
      </div>
    );
  }
  if (kind === "kpis") {
    return (
      <div className="animate-pulse space-y-4" aria-hidden>
        {title}
        <div className={`${skeletonBlock} h-28`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 rounded-2xl bg-[#f3eee4]" />
          <div className="h-24 rounded-2xl bg-[var(--admin-navy)]/85" />
        </div>
        <div className={`${skeletonBlock} divide-y divide-[#e5e3dc] overflow-hidden`}>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-16 px-5" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {title}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={`${skeletonBlock} h-24`} />
      ))}
    </div>
  );
}
