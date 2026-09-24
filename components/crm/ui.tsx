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
      <p className="font-display text-lg font-bold">Ajoutez un téléphone pour continuer.</p>
      <p className="mt-2 text-sm">L’agence a besoin d’un numéro pour vous joindre.</p>
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
    case "travelling":
    case "completed":
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

export function CrmSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-7 w-44 rounded-lg bg-[var(--admin-peach)]" />
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-24 rounded-2xl bg-white ring-1 ring-[#e5e3dc]"
        />
      ))}
    </div>
  );
}
