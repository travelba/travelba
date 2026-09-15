import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function BrandMark({
  href = "/",
  subtitle,
}: {
  href?: string;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--admin-navy)] font-display text-[11px] font-extrabold tracking-wider text-white shadow-sm">
        TBA
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">
          Travelba
        </span>
        {subtitle ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-red)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--admin-red)]" />
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
  tone?: "sky" | "green" | "amber" | "red" | "navy";
  children: React.ReactNode;
}) {
  const tones = {
    sky: "bg-[var(--admin-sky)] text-[var(--admin-navy)] border-transparent",
    green: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-red-50 text-[var(--admin-red)] border-red-200",
    navy: "bg-[var(--admin-navy)] text-white border-transparent",
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

export function ConciergeBanner() {
  return (
    <aside className="admin-af-card flex flex-col gap-4 rounded-2xl bg-[var(--admin-sky)]/50 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-navy)]">
          Assistance personnalisée
        </p>
        <h3 className="mt-1 font-display text-lg font-bold text-[var(--admin-navy)]">
          Ligne privée Conciergerie 24/7
        </h3>
        <p className="mt-1 text-sm text-muted">
          Modifications urgentes, transferts ou questions sur votre dossier.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={`tel:${siteConfig.whatsappNumber}`}
          className="inline-flex items-center rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {siteConfig.phoneDisplay}
        </a>
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="admin-af-btn inline-flex items-center rounded-xl px-4 py-2.5 text-sm"
        >
          Écrire à Travelba
        </a>
      </div>
    </aside>
  );
}

export function bookingStatusTone(
  status: string
): "sky" | "green" | "amber" | "red" | "navy" {
  switch (status) {
    case "confirmed":
    case "travelling":
    case "completed":
      return "green";
    case "quoted":
    case "draft":
      return "amber";
    case "cancelled":
      return "red";
    default:
      return "sky";
  }
}
